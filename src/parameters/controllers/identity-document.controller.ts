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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IdentityDocumentService } from '../services/identity-document.service';
import { CreateIdentityDocumentDto } from '../dto/create/create-identity-document.dto';
import { UpdateIdentityDocumentDto } from '../dto/update/update-identity-document.dto';
import { IdentityDocument } from '../entities/identity-document.entity';
import { IdentityDocumentQueryDto } from '../dto/query/identity-document-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';


@ApiTags('Identity Document')
@Public()
@Controller('identity-document')
export class IdentityDocumentController {
  constructor(private readonly service: IdentityDocumentService) {}


  @Get()
  @ApiOperation({ summary: 'List identity documents (paginated & filtered)' })
  findAll(@Query() query: IdentityDocumentQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find identity document by ID' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
}
