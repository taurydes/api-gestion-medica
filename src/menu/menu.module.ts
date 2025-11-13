import { Module } from '@nestjs/common';
import { MenuService } from './menu.service';
import { MenuController } from './menu.controller';
import { Menu } from './entities/menu.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

@Module({
    imports: [
      TypeOrmModule.forFeature([Menu], DatabaseConnectionName.DB_MAIN), 
      AuthModule,
    ],
  controllers: [MenuController],
  providers: [MenuService],
})
export class MenuModule {}
