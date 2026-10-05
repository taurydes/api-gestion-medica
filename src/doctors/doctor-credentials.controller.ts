import { Controller, Delete, Get, Param, Post, Req, Res, UploadedFile } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ParseUuid } from 'src/common/pipes/parse-uuid.pipe';
import { FileUpload } from 'src/files/upload-limits';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { CREDENTIAL_MAX_BYTES, CredentialKind, DoctorCredentialsService } from './doctor-credentials.service';

const PROFILE_UPDATE = `profile.${PermissionActionsMenu.UPDATE}`;
const DOCTORS_VIEW = `${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.VIEW}`;
const DOCTORS_UPDATE = `${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.UPDATE}`;
// Literal paths, not `:kind`: a param would shadow DoctorsController routes such as DELETE schedules/:blockId.
const kindOf = (req: Request): CredentialKind => (req.path.endsWith('/stamp') ? 'stamp' : 'signature');

/** The caller's doctor profile and the private signature/stamp images; registered before DoctorsController's `:id`. */
@ApiTags('Doctors')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('doctors')
export class DoctorCredentialsController {
  constructor(private readonly credentials: DoctorCredentialsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Perfil médico del usuario autenticado, con hasSignature y hasStamp' })
  @ApiResponse({ status: 404, description: 'El usuario no tiene perfil médico.' })
  getMe(@GetUser('id') userId: string) {
    return this.credentials.getMyProfile(userId);
  }

  @Post(['me/signature', 'me/stamp'])
  @Permission(PROFILE_UPDATE)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sube la firma o el sello propio (PNG/JPEG/WebP, máx. 2 MB)' })
  @FileUpload('file', CREDENTIAL_MAX_BYTES)
  async uploadMine(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @GetUser('id') userId: string,
  ) {
    return this.credentials.upload(await this.credentials.myDoctorId(userId), kindOf(req), file);
  }

  @Delete(['me/signature', 'me/stamp'])
  @Permission(PROFILE_UPDATE)
  @ApiOperation({ summary: 'Elimina la firma o el sello propio' })
  async removeMine(@Req() req: Request, @GetUser('id') userId: string) {
    return this.credentials.remove(await this.credentials.myDoctorId(userId), kindOf(req));
  }

  @Post([':id/signature', ':id/stamp'])
  @Permission(DOCTORS_UPDATE)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sube la firma o el sello de un médico (el propio médico o un administrador)' })
  @FileUpload('file', CREDENTIAL_MAX_BYTES)
  async upload(
    @Param('id', ParseUuid) id: string,
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @GetUser('id') userId: string,
  ) {
    await this.credentials.assertOwnerOrAdmin(id, userId);
    return this.credentials.upload(id, kindOf(req), file);
  }

  @Delete([':id/signature', ':id/stamp'])
  @Permission(DOCTORS_UPDATE)
  @ApiOperation({ summary: 'Elimina la firma o el sello de un médico (el propio médico o un administrador)' })
  async remove(
    @Param('id', ParseUuid) id: string,
    @Req() req: Request,
    @GetUser('id') userId: string,
  ) {
    await this.credentials.assertOwnerOrAdmin(id, userId);
    return this.credentials.remove(id, kindOf(req));
  }

  @Get([':id/signature', ':id/stamp'])
  @Permission(DOCTORS_VIEW)
  @ApiOperation({ summary: 'Imagen PNG de la firma o el sello (el propio médico o un administrador; nunca pública)' })
  async image(
    @Param('id', ParseUuid) id: string,
    @Req() req: Request,
    @GetUser('id') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.credentials.assertOwnerOrAdmin(id, userId);
    const file = await this.credentials.filePath(id, kindOf(req));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(file);
  }
}
