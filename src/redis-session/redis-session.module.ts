import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisSessionService } from './redis-session.service';
import { createClient } from 'redis';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_SESSION_CLIENT',
      useFactory: async (config: ConfigService) => {
        const client = createClient({
          socket: {
            host: config.get('REDIS_SESSION_HOST') || config.get('REDIS_HOST'),
            port: parseInt(config.get('REDIS_SESSION_PORT') || '6379', 10),
          },
          password: config.get('REDIS_SESSION_PASS') || undefined,
        });
        client.on('error', (err) => console.error('❌ Redis Session Error:', err));
        await client.connect();
        console.log('✅ Redis Session conectado');
        return client;
      },
      inject: [ConfigService],
    },
    RedisSessionService,
  ],
  exports: [RedisSessionService, 'REDIS_SESSION_CLIENT'],
})
export class RedisSessionModule {}
