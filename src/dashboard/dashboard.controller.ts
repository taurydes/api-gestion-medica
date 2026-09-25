import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

// No existe un menú `dashboard` en seguridad.menu: el tablero muestra citas, se exige appointments.consultar
const DASHBOARD_PERMISSION = `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`;

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Estadísticas generales del sistema.
   * El servicio filtra datos según el alcance del usuario (admin, doctor o ninguno).
   */
  @Get('stats')
  @Permission(DASHBOARD_PERMISSION)
  @ApiOperation({ summary: 'Obtener estadísticas del dashboard' })
  getStats(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getStats(user);
  }

  /**
   * Citas recientes: admin (permiso security.consultar) todas; doctor solo las suyas;
   * otros ninguna, porque solo los doctores tienen centros asignados.
   */
  @Get('recent-appointments')
  @Permission(DASHBOARD_PERMISSION)
  @ApiOperation({ summary: 'Obtener citas recientes' })
  getRecentAppointments(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getRecentAppointments(user);
  }

  /**
   * Distribución de citas por estado (para gráfica de donut/pie)
   */
  @Get('appointments-by-status')
  @Permission(DASHBOARD_PERMISSION)
  @ApiOperation({ summary: 'Distribución de citas por estado' })
  getAppointmentsByStatus(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getAppointmentsByStatus(user);
  }

  /**
   * Citas por mes del año actual (para gráfica de barras/líneas)
   */
  @Get('appointments-by-month')
  @Permission(DASHBOARD_PERMISSION)
  @ApiOperation({ summary: 'Citas por mes del año actual' })
  getAppointmentsByMonth(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getAppointmentsByMonth(user);
  }
}
