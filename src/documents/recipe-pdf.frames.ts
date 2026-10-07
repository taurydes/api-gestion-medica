import * as pdfmake from 'pdfmake';
import type {
  CanvasElement,
  Content,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

/** A rounded box drawn behind a group whose height is only known after a first layout pass. */
export interface FrameSpec {
  group: string;
  /** Tells apart frames sharing a group (side-by-side cards). */
  slot?: number;
  width: number;
  /** Fixed height and offset inside the group, for boxes whose size is known up front. */
  height?: number;
  offset?: { x: number; y: number };
  radius: number;
  fill: string;
  stroke: string;
  /** Top band (table header) filled up to `marker`'s top minus `inset`. */
  band?: { marker: string; fill: string; inset: number };
  /** Table layout the framed body falls back to when the group splits across pages. */
  fallbackLayout?: string;
}

interface Mark {
  page: number;
  left: number;
  top: number;
  ratio: number;
  innerBottom: number;
}

interface Shift {
  page: number;
  top: number;
  by: number;
}

type FrameNode = {
  canvas: CanvasElement[];
  _frame: FrameSpec;
  relativePosition?: { x: number; y: number };
  absolutePosition?: { x: number; y: number };
};

// Invisible zero-size vector: pdfmake only reports positions for nodes that draw something.
// A new object each time: pdfmake offsets vectors in place, so a shared one drifts down the page.
const invisible = (): CanvasElement => ({
  type: 'rect',
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  lineColor: '#ffffff',
  strokeOpacity: 0,
});
// Groups taller than this share of a page may split instead of jumping whole to the next page.
const KEEP_TOGETHER_RATIO = 0.55;

export const marker = (id: string): Content =>
  ({ id, canvas: [invisible()] }) as Content;

const frameId = (spec: FrameSpec) => `frame:${spec.group}:${spec.slot ?? 0}`;

/** Placeholder for the box; `renderFramedPdf` replaces its canvas once the group is measured. */
export const frame = (spec: FrameSpec): Content =>
  ({
    id: frameId(spec),
    relativePosition: { x: 0, y: 0 },
    canvas: [invisible()],
    _frame: spec,
  }) as unknown as Content;

/** Wraps a group in start/end markers so it can be measured and kept on one page. */
export const group = (
  key: string,
  children: Content[],
  margin?: [number, number, number, number],
): Content => ({
  stack: [marker(`start:${key}`), ...children, marker(`end:${key}`)],
  ...(margin ? { margin } : {}),
});

/** Lays the document out once to measure the groups, then renders it with their frames drawn. */
export async function renderFramedPdf(
  definition: TDocumentDefinitions,
): Promise<Buffer> {
  const { marks, breaks } = await measure(definition);
  const final = structuredClone(definition);
  applyLayout(final.content, marks, breaks, spacerShifts(marks));
  return pdfmake.createPdf(final).getBuffer();
}

async function measure(
  definition: TDocumentDefinitions,
): Promise<{ marks: Map<string, Mark>; breaks: Set<string> }> {
  const marks = new Map<string, Mark>();
  const breaks = new Set<string>();
  const probe = structuredClone(definition);
  probe.pageBreakBefore = (node, nodes) => {
    const id = typeof node.id === 'string' ? node.id : null;
    if (!id) return false;
    const { pageNumber, left, top, verticalRatio, pageInnerHeight } =
      node.startPosition;
    const innerTop = top - verticalRatio * pageInnerHeight;
    marks.set(id, {
      page: pageNumber,
      left,
      top,
      ratio: verticalRatio,
      innerBottom: innerTop + pageInnerHeight,
    });
    if (!id.startsWith('start:') || verticalRatio < 0.02) return false;

    const endId = `end:${id.slice('start:'.length)}`;
    if (nodes.getFollowingNodesOnPage().some((n) => n.id === endId))
      return false;
    const end = nodes.getNodesOnNextPage().find((n) => n.id === endId);
    if (!end) return false;
    const height =
      innerTop + pageInnerHeight - top + (end.startPosition.top - innerTop);
    if (height > pageInnerHeight * KEEP_TOGETHER_RATIO) return false;
    breaks.add(id);
    return true;
  };
  await pdfmake.createPdf(probe).getBuffer();
  return { marks, breaks };
}

/** Space each spacer adds above its group, so frames measured below it can move down with it. */
function spacerShifts(marks: Map<string, Mark>): Shift[] {
  const shifts: Shift[] = [];
  for (const [id, spacer] of marks) {
    if (!id.startsWith('spacer:')) continue;
    const end = marks.get(`end:${id.slice('spacer:'.length)}`);
    // A group that opens a page stays at its top: pushing it down would leave a blank page above it.
    if (end && end.page === spacer.page && spacer.ratio > 0.02) {
      shifts.push({
        page: spacer.page,
        top: spacer.top,
        by: Math.max(0, Math.floor(end.innerBottom - end.top - 2)),
      });
    }
  }
  return shifts;
}

function applyLayout(
  node: unknown,
  marks: Map<string, Mark>,
  breaks: Set<string>,
  shifts: Shift[],
): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => {
      const frameNode = (child as Partial<FrameNode>)?._frame
        ? (child as FrameNode)
        : null;
      if (frameNode && !drawFrame(frameNode, marks, shifts)) {
        const body = node[i + 1] as { layout?: string } | undefined;
        if (body && frameNode._frame.fallbackLayout)
          body.layout = frameNode._frame.fallbackLayout;
      }
      applyLayout(child, marks, breaks, shifts);
    });
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (typeof record.id === 'string') {
    if (breaks.has(record.id)) record.pageBreak = 'before';
    const spacer = marks.get(record.id);
    const shift =
      spacer &&
      shifts.find((s) => s.page === spacer.page && s.top === spacer.top);
    if (record.id.startsWith('spacer:') && shift)
      record.margin = [0, shift.by, 0, 0];
  }
  for (const key of ['stack', 'columns', 'table', 'body']) {
    if (record[key]) applyLayout(record[key], marks, breaks, shifts);
  }
}

/** Draws the measured box; false when the group split across pages and gets no frame. */
function drawFrame(
  node: FrameNode,
  marks: Map<string, Mark>,
  shifts: Shift[],
): boolean {
  const spec = node._frame;
  const start = marks.get(`start:${spec.group}`);
  const end = marks.get(`end:${spec.group}`);
  const at = marks.get(frameId(spec));
  if (
    !start ||
    !end ||
    !at ||
    start.page !== end.page ||
    at.page !== start.page ||
    end.top <= start.top
  ) {
    node.canvas = [];
    return false;
  }
  // Absolute, not relative: pdfmake rejects a relative canvas taller than the space left below it.
  delete node.relativePosition;
  const moved = shifts
    .filter((s) => s.page === start.page && s.top <= start.top)
    .reduce((sum, s) => sum + s.by, 0);
  node.absolutePosition = {
    x: at.left + (spec.offset?.x ?? 0),
    y: start.top + moved + (spec.offset?.y ?? 0),
  };
  const h = spec.height ?? end.top - start.top;
  const { width: w, radius: r } = spec;
  const shapes: CanvasElement[] = [
    { type: 'rect', x: 0, y: 0, w, h, r, color: spec.fill },
  ];
  const bandMark = spec.band ? marks.get(spec.band.marker) : undefined;
  if (spec.band && bandMark && bandMark.page === start.page) {
    // Rounded top, square bottom; a canvas `path` is not offset by pdfmake, so it is built from rects.
    const b = Math.max(r, bandMark.top - start.top - spec.band.inset);
    shapes.push(
      { type: 'rect', x: 0, y: 0, w, h: b, r, color: spec.band.fill },
      { type: 'rect', x: 0, y: b - r, w, h: r, color: spec.band.fill },
    );
  }
  shapes.push({
    type: 'rect',
    x: 0,
    y: 0,
    w,
    h,
    r,
    lineColor: spec.stroke,
    lineWidth: 0.75,
  });
  node.canvas = shapes;
  return true;
}
