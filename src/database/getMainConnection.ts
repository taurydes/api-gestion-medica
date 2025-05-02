import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from './DatabaseConnectionName';
import { ConfigModule, ConfigService } from '@nestjs/config';

export function getMainConnection() {
  return TypeOrmModule.forRootAsync({
    name: DatabaseConnectionName.DB_MAIN,
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (configService: ConfigService) => {
      return {
        name: DatabaseConnectionName.DB_MAIN,
        type: 'postgres',
        host: configService.get('database.host')!,
        port: configService.get('database.port')!,
        username: configService.get('database.user')!,
        password: configService.get('database.pass')!,
        database: configService.get('database.name')!,
        autoLoadEntities: true,
        synchronize: false,
      };
    },
  });
}

