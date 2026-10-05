import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public } from 'src/auth/decorators/public.decorator';
import { RecipeVerificationService } from './recipe-verification.service';

/** Anti-forgery lookup reached from the QR printed on the recipe PDF; no session needed. */
@ApiTags('Verificación pública')
@Controller('public/recipes')
export class RecipeVerificationController {
  constructor(private readonly verification: RecipeVerificationService) {}

  @Public()
  // Stricter than the global 100/min: codes are unguessable, but each miss still costs a query.
  @Throttle({ long: { limit: 10, ttl: 60_000, blockDuration: 60_000 } })
  @Get('verify/:code')
  @ApiOperation({ summary: 'Verifica la autenticidad de una receta por su código (sin datos clínicos)' })
  @ApiResponse({ status: 200, description: 'valid true con datos mínimos, o valid false con status (anulada o eliminada)' })
  @ApiResponse({ status: 404, description: '{ valid: false }: código desconocido' })
  @ApiResponse({ status: 429, description: 'Más de 10 consultas por minuto desde la misma IP' })
  async verify(
    @Param('code') code: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { found, body } = await this.verification.verify(code, req.ip ?? null);
    // A body, not an exception: the error filter would replace { valid: false } with its own envelope.
    if (!found) res.status(404);
    return body;
  }
}
