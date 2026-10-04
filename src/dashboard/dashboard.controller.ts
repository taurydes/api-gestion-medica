import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

// No `dashboard` menu exists: appointments.consultar, or patient.consultar for staff such as the nurse (MJ-38).
const DASHBOARD_PERMISSIONS = [
  `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`,
  `${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.VIEW}`,
];

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
  @Permission(...DASHBOARD_PERMISSIONS)
  @ApiOperation({ summary: 'Obtener estadísticas del dashboard' })
  getStats(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getStats(user);
  }

  /**
   * Citas recientes: admin (permiso security.consultar) todas; doctor solo las suyas;
   * otro personal, las de sus centros (users_medical_centers, MJ-38).
   */
  @Get('recent-appointments')
  @Permission(...DASHBOARD_PERMISSIONS)
  @ApiOperation({ summary: 'Obtener citas recientes' })
  getRecentAppointments(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getRecentAppointments(user);
  }

  /**
   * Distribución de citas por estado (para gráfica de donut/pie)
   */
  @Get('appointments-by-status')
  @Permission(...DASHBOARD_PERMISSIONS)
  @ApiOperation({ summary: 'Distribución de citas por estado' })
  getAppointmentsByStatus(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getAppointmentsByStatus(user);
  }

  /**
   * Citas por mes del año actual (para gráfica de barras/líneas)
   */
  @Get('appointments-by-month')
  @Permission(...DASHBOARD_PERMISSIONS)
  @ApiOperation({ summary: 'Citas por mes del año actual' })
  getAppointmentsByMonth(@Req() req: any) {
    const user = req.user;
    return this.dashboardService.getAppointmentsByMonth(user);
  }
}
