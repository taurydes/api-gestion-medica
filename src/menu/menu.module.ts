import { forwardRef, Module } from '@nestjs/common';
import { MenuService } from './menu.service';
import { MenuController } from './menu.controller';
import { Menu } from './entities/menu.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'src/user/user.module';

@Module({
    imports: [
      TypeOrmModule.forFeature([Menu], DatabaseConnectionName.DB_MAIN), 
      forwardRef(() => UserModule),
    ],
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService, TypeOrmModule],
})
export class MenuModule {}
