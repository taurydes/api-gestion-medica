import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Estadísticas generales del sistema.
   * Disponible para todos los usuarios autenticados.
   * El servicio filtra datos según el rol del usuario.
   */
  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas del dashboard' })
  getStats(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getStats(user);
  }

  /**
   * Citas recientes filtradas según el rol:
   * - Admin: todas las citas
   * - Doctor: solo sus citas
   * - Otros: citas de su centro médico
   */
  @Get('recent-appointments')
  @ApiOperation({ summary: 'Obtener citas recientes' })
  getRecentAppointments(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getRecentAppointments(user);
  }

  /**
   * Distribución de citas por estado (para gráfica de donut/pie)
   */
  @Get('appointments-by-status')
  @ApiOperation({ summary: 'Distribución de citas por estado' })
  getAppointmentsByStatus(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getAppointmentsByStatus(user);
  }

  /**
   * Citas por mes del año actual (para gráfica de barras/líneas)
   */
  @Get('appointments-by-month')
  @ApiOperation({ summary: 'Citas por mes del año actual' })
  getAppointmentsByMonth(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getAppointmentsByMonth(user);
  }
}
