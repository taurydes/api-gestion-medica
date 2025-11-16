import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from 'src/auth/interfaces/User';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CreateAdvertisingPlanDto } from './dto/create-advertising-plan.dto';
import { UpdateAdvertisingPlanDto } from './dto/update-advertising-plan.dto';
import { PlanService } from './plan.service';
import { AdvertisingPlanQueryDto } from './dto/advertising-plan-query.dto';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { PermissionActionsMenu } from 'src/permission/permission.const';


@ApiTags('Plans')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('plans')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Post()
  @ApiOperation({ summary: 'Create advertising plan' })
  @Permission(`plans.${PermissionActionsMenu.CREATE}`)
  create(@Body() dto: CreateAdvertisingPlanDto, @GetUser() user: AuthUser) {
    return this.planService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: AdvertisingPlanQueryDto) {
    return this.planService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planService.findOne(+id);
  }

  @Patch(':id')
  @Permission(`plans.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() dto: UpdateAdvertisingPlanDto) {
    return this.planService.update(+id, dto);
  }

  @Delete(':id')
  @Permission(`plans.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.planService.remove(+id);
  }
}
