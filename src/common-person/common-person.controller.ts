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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { CommonPersonService } from './common-person.service';
import { CommonPersonQueryDto } from './dto/common-person-query.dto';
import { CreateCommonPersonDto } from './dto/create-common-person.dto';
import { UpdateCommonPersonDto } from './dto/update-common-person.dto';

@ApiTags('Common Persons')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('common-persons')
export class CommonPersonController {
  constructor(private readonly commonPersonService: CommonPersonService) {}

  @ApiOperation({ summary: 'Crear persona común' })
  @Post()
  @Permission(`${ModuleItemsMenu.CommonPersonModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() createCommonPersonDto: CreateCommonPersonDto) {
    return this.commonPersonService.create(createCommonPersonDto);
  }

  @ApiOperation({ summary: 'Listar personas comunes' })
  @Get()
  @Permission(`${ModuleItemsMenu.CommonPersonModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: CommonPersonQueryDto) {
    return this.commonPersonService.findAll(query);
  }

  @ApiOperation({ summary: 'Obtener persona por ID' })
  @Get(':id')
  @Permission(`${ModuleItemsMenu.CommonPersonModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.commonPersonService.findOne(id);
  }

  @ApiOperation({ summary: 'Actualizar persona' })
  @Patch(':id')
  @Permission(`${ModuleItemsMenu.CommonPersonModule}.${PermissionActionsMenu.UPDATE}`)
  update(
    @Param('id') id: string,
    @Body() updateCommonPersonDto: UpdateCommonPersonDto,
  ) {
    return this.commonPersonService.update(id, updateCommonPersonDto);
  }

  @ApiOperation({ summary: 'Eliminar persona' })
  @Delete(':id')
  @Permission(`${ModuleItemsMenu.CommonPersonModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.commonPersonService.remove(id);
  }
}
