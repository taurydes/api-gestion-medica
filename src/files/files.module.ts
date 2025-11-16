import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoPublicity } from './entities/video-publicy.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoPublicity], DatabaseConnectionName.DB_MAIN),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
