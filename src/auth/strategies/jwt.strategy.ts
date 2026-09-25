import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * Estrategia: JwtStrategy
 *
 * Define cómo se valida y decodifica un token JWT usando Passport.
 * Extrae el token desde el header Authorization (Bearer).
 * Valida la firma y el contenido del token con la clave definida.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      // Extrae el token JWT del header Authorization
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Rechaza tokens expirados
      ignoreExpiration: false,
      // Clave usada para verificar el token
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Valida el payload del token decodificado.
   * Retorna la información que se adjuntará al request (req.user).
   */
  async validate(payload: any) {
    return { userId: payload.sub, name: payload.name };
  }
}
