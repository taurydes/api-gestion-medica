import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateEmailDto, SendTemplateEmailDto } from './dto/create-email.dto';
import { EmailService } from './email.service';

@ApiTags('email')
@Controller('email')
@Throttle({ long: {} })
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @ApiOperation({ summary: 'Enviar correo de prueba' })
  @ApiResponse({ status: 201, description: 'Correo enviado correctamente.' })
  async sendEmail(@Body() dto: CreateEmailDto) {
    return await this.emailService.sendEmail(dto);
  }

  @Post('send-template')
  @ApiOperation({ summary: 'Enviar correo usando plantilla HTML' })
  @ApiBody({ type: SendTemplateEmailDto })
  @ApiResponse({
    status: 201,
    description: 'Correo con plantilla enviado correctamente.',
  })
  async sendEmailWithTemplate(@Body() dto: SendTemplateEmailDto) {
    return await this.emailService.sendEmailWithTemplate(dto, dto.replacements);
  }

  @Post('queue')
  @ApiOperation({ summary: 'Encolar correo para envío en background' })
  @ApiResponse({
    status: 201,
    description: 'Correo encolado correctamente.',
  })
  async sendEmailQueued(@Body() dto: CreateEmailDto) {
    return await this.emailService.sendEmailQueued(dto);
  }
}
