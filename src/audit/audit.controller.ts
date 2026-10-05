import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { AccessLog, AccessLogAction } from './entities/access-log.entity';

export class AccessLogQueryDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() resource?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsIn(['read', 'write', 'login_failed', 'email_sent', 'recipe_verify']) action?: AccessLogAction;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

/** Read side of the access trail (MJ-39); same permission as the error log. */
@ApiBearerAuth()
@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(
    @InjectRepository(AccessLog, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<AccessLog>,
  ) {}

  @ApiOperation({ summary: 'Bitácora de accesos: escrituras y lecturas de datos clínicos' })
  @Get('access-log')
  @Permission(`${ModuleItemsMenu.LogsModule}.${PermissionActionsMenu.VIEW}`)
  async findAll(@Query() query: AccessLogQueryDto) {
    const qb = this.repo.createQueryBuilder('log').orderBy('log.createdAt', 'DESC');
    if (query.userId) qb.andWhere('log.userId = :userId', { userId: query.userId });
    if (query.resource) qb.andWhere('log.resource = :resource', { resource: query.resource });
    if (query.resourceId) qb.andWhere('log.resourceId = :resourceId', { resourceId: query.resourceId });
    if (query.action) qb.andWhere('log.action = :action', { action: query.action });
    if (query.from) qb.andWhere('log.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('log.createdAt <= :to', { to: new Date(query.to) });
    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, limit: query.limit };
  }
}
