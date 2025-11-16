import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { KioskoService } from '../services/kiosko.service';
import { KioskoQueryDto } from '../dto/query/kiosko-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('Kioskos')
@Public()
@Controller('kioskos')
export class KioskoController {
  constructor(private readonly kioskoService: KioskoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar kioskos con paginación' })
  findAll(@Query() query: KioskoQueryDto) {
    return this.kioskoService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un kiosko por ID' })
  findOne(@Param('id') id: string) {
    return this.kioskoService.findOne(+id);
  }
  
}
