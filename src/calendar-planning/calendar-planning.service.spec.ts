import { Test, TestingModule } from '@nestjs/testing';
import { CalendarPlanningService } from './calendar-planning.service';

describe('CalendarPlanningService', () => {
  let service: CalendarPlanningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CalendarPlanningService],
    }).compile();

    service = module.get<CalendarPlanningService>(CalendarPlanningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
