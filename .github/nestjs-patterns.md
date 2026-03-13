# Guía de Patrones — Proyecto NestJS Backend GE

> Documento de referencia para generar componentes consistentes en el proyecto.
> Aplica a toda nueva funcionalidad: módulos, servicios, controladores, DTOs y entidades.

---

## Tabla de Contenidos

1. [Estructura de Carpetas](#estructura-de-carpetas)
2. [Convenciones de Nomenclatura](#convenciones-de-nomenclatura)
3. [Constantes Globales](#constantes-globales)
4. [Patrón: Entidad (Entity)](#patrón-entidad)
5. [Patrón: Vista (ViewEntity)](#patrón-vista)
6. [Patrón: DTOs](#patrón-dtos)
7. [Patrón: Servicio (Service)](#patrón-servicio)
8. [Patrón: Controlador (Controller)](#patrón-controlador)
9. [Patrón: Módulo (Module)](#patrón-módulo)
10. [Patrón: Métodos de Paso (createFromStepN)](#patrón-métodos-de-paso)
11. [Seguridad y Buenas Prácticas](#seguridad-y-buenas-prácticas)
12. [Flujo Completo para un Nuevo Módulo](#flujo-completo-para-un-nuevo-módulo)

---

## Estructura de Carpetas

```
src/
├── [nombre-modulo]/
│   ├── dto/
│   │   ├── create-[nombre].dto.ts
│   │   ├── update-[nombre].dto.ts
│   │   ├── query-[nombre].dto.ts
│   │   ├── [nombre]-response.dto.ts
│   │   └── create-from-step-[n].dto.ts   ← solo si aplica
│   ├── entities/
│   │   └── [nombre].entity.ts
│   ├── [nombre].controller.ts
│   ├── [nombre].service.ts
│   └── [nombre].module.ts
├── common/
│   └── dto/
│       └── query-pagination.dto.ts
└── database/
    └── DatabaseConnectionName.ts
```

---

## Convenciones de Nomenclatura

| Elemento | Convención | Ejemplo |
|---|---|---|
| Clase Entidad | PascalCase inglés | `Company`, `LawyerAssignment` |
| Propiedades de entidad | camelCase inglés | `officeId`, `reservedNameId` |
| Columnas en BD (`@Column.name`) | snake_case español | `oficina_id`, `nombre_reservado_id` |
| DTO Create | `Create[Nombre]Dto` | `CreateCompanyDto` |
| DTO Update | `Update[Nombre]Dto` | `UpdateCompanyDto` |
| DTO Query | `Query[Nombre]Dto` | `QueryCompanyDto` |
| DTO Response | `[Nombre]ResponseDto` | `CompanyResponseDto` |
| DTO Paso N | `CreateFromStep[N]Dto` | `CreateFromStepSixDto` |
| Controlador | `[Nombre]Controller` | `CompanyController` |
| Servicio | `[Nombre]Service` | `CompanyService` |
| Módulo | `[Nombre]Module` | `CompanyModule` |
| Cache key — item | `[modulo]:[id]` | `company:42` |
| Cache key — lista | `[modulo]:query:[JSON]` | `company:query:{...}` |
| Cache key — registro | `[modulo]:query:keys` | `company:query:keys` |

---

## Constantes Globales

```typescript
// src/database/DatabaseConnectionName.ts
export enum DatabaseConnectionName {
  DB_MAIN = 'main',
  DB_MAIN_CENTRALIZADO = 'centralizado',
}
```

---

## Patrón: Entidad

> Usar siempre para tablas regulares con soft delete.

```typescript
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OtraEntidad } from '../../ruta/entities/otra-entidad.entity';

@Entity({ name: 'nombre_tabla_bd', schema: 'public' })
@Index(['id'])
@Index(['campoFkId'])
export class NombreEntidad {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id: number;

  @Column({ name: 'campo_texto', type: 'varchar', length: 255, nullable: false })
  campoTexto: string;

  @Column({ name: 'campo_fk_id', type: 'bigint', nullable: false })
  campoFkId: number;

  @Column({ name: 'campo_opcional', type: 'text', nullable: true })
  campoOpcional: string | null;

  @Column({ name: 'campo_bool', type: 'bool', nullable: false, default: true })
  status: boolean;

  @Column({ name: 'user_id', type: 'bigint', nullable: false, default: 1 })
  userId: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'now()',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    precision: 0,
    nullable: true,
  })
  updatedAt?: Date;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamp',
    precision: 0,
    nullable: true,
  })
  deletedAt?: Date;

  // ── Relaciones ───────────────────────────────────────────────────────────────
  @ManyToOne(() => OtraEntidad, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'campo_fk_id' })
  otraEntidad?: OtraEntidad;
}
```

### Reglas de Entidad

- Todo campo FK lleva `@Index`.
- Los timestamps (`created_at`, `updated_at`, `deleted_at`) **siempre** presentes.
- `deleted_at` habilita el soft delete de TypeORM (`softDelete` / `restore`).
- Las relaciones se declaran como **opcionales** (`?`) para no forzar el join en cada consulta.

---

## Patrón: Vista

> Usar para tablas o vistas SQL de solo lectura (sin soft delete).

```typescript
import { ViewColumn, ViewEntity } from 'typeorm';

@ViewEntity({ name: 'v_nombre_vista', schema: 'public' })
export class VNombreVista {
  @ViewColumn({ name: 'columna_bd' })
  campoIngles: string;

  @ViewColumn({ name: 'columna_bd_2' })
  campoIngles2: number;
}
```

### Reglas de Vista

- Prefijo `V` en el nombre de la clase: `VNombreVista`.
- Archivo: `v-nombre-vista.entity.ts`.
- No tiene timestamps ni `@PrimaryGeneratedColumn`; si hay PK, declarar con `@ViewColumn`.
- Se registra en el módulo con `TypeOrmModule.forFeature([VNombreVista], ...)`.

---

## Patrón: DTOs

### `create-[nombre].dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateNombreDto {
  @ApiProperty({ description: 'ID de relación', example: 1 })
  @IsInt()
  @Min(1)
  campoFkId: number;

  @ApiPropertyOptional({ description: 'Texto opcional', example: 'Valor' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  campoTexto?: string | null;

  @ApiPropertyOptional({ description: 'Estatus', example: true, default: true })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
```

### `update-[nombre].dto.ts`

```typescript
import { PartialType } from '@nestjs/swagger';
import { CreateNombreDto } from './create-nombre.dto';

export class UpdateNombreDto extends PartialType(CreateNombreDto) {}
```

### `query-[nombre].dto.ts`

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class QueryNombreDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Búsqueda general', example: 'texto' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtro por FK', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  campoFkId?: number;

  @ApiPropertyOptional({ description: 'Incluir eliminados', example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDeleted?: boolean;
}
```

### `[nombre]-response.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NombreResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  campoFkId: number;

  @ApiPropertyOptional({ example: 'Nombre relacionado' })
  campoFkNombre?: string;

  @ApiPropertyOptional({ example: 'Texto' })
  campoTexto?: string | null;

  @ApiProperty({ example: true })
  status: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ example: '2024-01-02T00:00:00.000Z' })
  updatedAt?: Date;
}
```

### `bulk-create-[nombre].dto.ts` _(opcional)_

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateNombreDto } from './create-nombre.dto';

export class BulkCreateNombreDto {
  @ApiProperty({ type: [CreateNombreDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateNombreDto)
  @ArrayMinSize(1)
  items: CreateNombreDto[];
}
```

### `query-pagination.dto.ts` _(base compartida)_

```typescript
// src/common/dto/query-pagination.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class QueryPaginationDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'ASC', default: 'ASC' })
  @IsOptional()
  order?: 'ASC' | 'DESC' = 'ASC';
}
```

---

## Patrón: Servicio

```typescript
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { DataSource, Repository } from 'typeorm';
import { OtroService } from '../otro/otro.service';
import { CreateNombreDto } from './dto/create-nombre.dto';
import { NombreResponseDto } from './dto/nombre-response.dto';
import { QueryNombreDto } from './dto/query-nombre.dto';
import { UpdateNombreDto } from './dto/update-nombre.dto';
import { NombreEntidad } from './entities/nombre-entidad.entity';

@Injectable()
export class NombreService {
  constructor(
    @InjectRepository(NombreEntidad, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<NombreEntidad>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private readonly dataSource: DataSource,
    private readonly otroService: OtroService,
  ) {}

  // ── Cache ────────────────────────────────────────────────────────────────────

  private async clearQueryCache(): Promise<void> {
    const listKey = 'nombre:query:keys';
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    for (const key of keys) await this.cacheManager.del(key);
    await this.cacheManager.del(listKey);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async create(dto: CreateNombreDto): Promise<NombreResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (dto.campoFkId) await this.otroService.findOne(dto.campoFkId);

      const entity = this.repo.create(dto);
      const saved = await queryRunner.manager.save(entity);

      await queryRunner.commitTransaction();
      await this.clearQueryCache();

      return this.mapToResponseDto(saved);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(query: QueryNombreDto) {
    const cacheKey = `nombre:query:${JSON.stringify(query)}`;
    const listKey  = 'nombre:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const { page = 1, limit = 10, order = 'ASC', search, campoFkId, includeDeleted = false } = query;

    const qb = this.repo.createQueryBuilder('n')
      .leftJoinAndSelect('n.otraEntidad', 'otra');

    if (search)     qb.andWhere('n.campoTexto ILIKE :search', { search: `%${search}%` });
    if (campoFkId)  qb.andWhere('n.campoFkId = :campoFkId', { campoFkId });
    if (!includeDeleted) qb.andWhere('n.deletedAt IS NULL');

    qb.orderBy('n.id', order).skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const result = {
      data: items.map(i => this.mapToResponseDto(i)),
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };

    await this.cacheManager.set(cacheKey, result, 300);
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys);
    }

    return result;
  }

  async findOne(id: number): Promise<NombreEntidad> {
    const cacheKey = `nombre:${id}`;
    const cached = await this.cacheManager.get<NombreEntidad>(cacheKey);
    if (cached) return cached;

    const entity = await this.repo.findOne({ where: { id }, relations: ['otraEntidad'] });
    if (!entity) throw new NotFoundException(`Registro con ID ${id} no encontrado.`);

    await this.cacheManager.set(cacheKey, entity, 600);
    return entity;
  }

  async findOneResponse(id: number): Promise<NombreResponseDto> {
    return this.mapToResponseDto(await this.findOne(id));
  }

  async update(id: number, dto: UpdateNombreDto): Promise<NombreResponseDto> {
    const entity = await this.findOne(id);
    try {
      if (dto.campoFkId && dto.campoFkId !== entity.campoFkId)
        await this.otroService.findOne(dto.campoFkId);

      await this.repo.update({ id }, dto as any);
      const updated = await this.findOne(id);

      await this.cacheManager.del(`nombre:${id}`);
      await this.clearQueryCache();

      return this.mapToResponseDto(updated);
    } catch (error) {
      throw new BadRequestException(`Error al actualizar: ${error.message}`);
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.repo.softDelete({ id });
    await this.cacheManager.del(`nombre:${id}`);
    await this.clearQueryCache();
    return { message: 'Registro eliminado exitosamente.', id };
  }

  async restore(id: number): Promise<NombreResponseDto> {
    await this.repo.restore({ id });
    const restored = await this.findOne(id);
    await this.cacheManager.del(`nombre:${id}`);
    await this.clearQueryCache();
    return this.mapToResponseDto(restored);
  }

  // ── Mapeo ────────────────────────────────────────────────────────────────────

  private mapToResponseDto(entity: NombreEntidad): NombreResponseDto {
    return {
      id: entity.id,
      campoFkId: entity.campoFkId,
      campoFkNombre: entity.otraEntidad?.nombre,
      campoTexto: entity.campoTexto,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
```

### Reglas del Servicio

| Regla | Detalle |
|---|---|
| Cache item | TTL **600 s** (10 min) en `findOne` |
| Cache lista | TTL **300 s** (5 min) en `findAll` |
| Cache key list | Registrar en `[modulo]:query:keys` para limpieza masiva |
| Transacciones | Siempre en `create`; en `update` solo si hay múltiples tablas |
| `findOne` interno | Lanza `NotFoundException` — nunca devuelve `null` |
| `mapToResponseDto` | Siempre `private`; único punto de transformación entidad→DTO |

---

## Patrón: Controlador

```typescript
import {
  Body, Controller, Delete, Get, Param,
  ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateNombreDto } from './dto/create-nombre.dto';
import { QueryNombreDto } from './dto/query-nombre.dto';
import { UpdateNombreDto } from './dto/update-nombre.dto';
import { NombreService } from './nombre.service';

@ApiTags('Nombre Módulo')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('nombre')
export class NombreController {
  constructor(private readonly nombreService: NombreService) {}

  @ApiOperation({ summary: 'Crear registro' })
  @Post()
  create(@Body() dto: CreateNombreDto) {
    return this.nombreService.create(dto);
  }

  @ApiOperation({ summary: 'Listar registros' })
  @Get()
  findAll(@Query() query: QueryNombreDto) {
    return this.nombreService.findAll(query);
  }

  @ApiOperation({ summary: 'Obtener registro por ID' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.nombreService.findOneResponse(id);
  }

  @ApiOperation({ summary: 'Actualizar registro' })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNombreDto) {
    return this.nombreService.update(id, dto);
  }

  @ApiOperation({ summary: 'Eliminar registro (soft delete)' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.nombreService.remove(id);
  }

  @ApiOperation({ summary: 'Restaurar registro eliminado' })
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.nombreService.restore(id);
  }
}
```

### Reglas del Controlador

- Siempre `@ApiBearerAuth()` y `@Throttle({ short: {} })`.
- IDs de ruta siempre con `@Param('id', ParseIntPipe)`.
- No hay lógica de negocio en el controlador — solo delegación al servicio.
- El `restore` va en `PATCH /:id/restore`, nunca en `POST`.

---

## Patrón: Módulo

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { OtroModule } from '../otro/otro.module';
import { NombreController } from './nombre.controller';
import { NombreEntidad } from './entities/nombre-entidad.entity';
import { NombreService } from './nombre.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NombreEntidad], DatabaseConnectionName.DB_MAIN),
    OtroModule,
  ],
  controllers: [NombreController],
  providers: [NombreService],
  exports: [NombreService],   // ← exportar si otros módulos lo usan
})
export class NombreModule {}
```

### Reglas del Módulo

- **No** incluir `CacheModule.register()` en el módulo propio; el caché está configurado globalmente en `AppModule`.
- Incluir en `TypeOrmModule.forFeature` **todas** las entidades que el servicio inyecta directamente como repositorio.
- Siempre `exports: [NombreService]` para que otros módulos puedan inyectarlo.

---

## Patrón: Métodos de Paso

> Usados para flujos multi-paso (constitución de empresa, etc.).  
> Convención: `createFromStepN` donde `N` es el número del paso.

### DTO del Paso

```typescript
// dto/create-from-step-[n].dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class CreateFromStepNDto {
  @ApiProperty({ example: 10, description: 'ID de la solicitud' })
  @IsInt()
  @IsPositive()
  requestId: number;

  @ApiProperty({ example: 1, description: 'ID del usuario autenticado' })
  @IsInt()
  @IsPositive()
  userId: number;
}
```

### Método en el Servicio

```typescript
async createFromStepN(
  dto: CreateFromStepNDto,
): Promise<{ success: boolean; message: string; [key: string]: any }> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Validaciones y consultas previas
    const request = await this.requestService.findOne(dto.requestId);

    // 2. Lógica de negocio dentro del queryRunner

    // 3. Commit
    await queryRunner.commitTransaction();
    await this.clearQueryCache();

    // 4. Actualizar bitácora (opcional, no crítico)
    await this._updateRequestLog(dto.requestId, { pasoN: { ... } });

    return { success: true, message: 'Operación exitosa.' };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw new BadRequestException(`Error en createFromStepN: ${error.message}`);
  } finally {
    await queryRunner.release();
  }
}
```

### Endpoint en el Controlador

```typescript
@ApiOperation({ summary: 'Paso N — descripción del paso' })
@Post('createFromStepN')
createFromStepN(@Body() dto: CreateFromStepNDto) {
  return this.nombreService.createFromStepN(dto);
}
```

### Reglas de los Métodos de Paso

- Usar **siempre** transacción con rollback automático.
- Las consultas de validación previas se hacen fuera de la transacción (son solo lectura).
- Las inserciones múltiples en tablas sin entidad TypeORM se hacen con `queryRunner.manager.query(SQL, params)`.
- La actualización de la bitácora (`request_log`) va **después** del commit y en bloque `try/catch` silencioso.
- El tipo de retorno mínimo es `{ success: boolean; message: string }`.

---

## Seguridad y Buenas Prácticas

### Protección IDOR

```typescript
// Siempre ParseIntPipe en parámetros de ruta
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) { ... }

// Siempre verificar existencia antes de operar
async update(id: number, dto: UpdateNombreDto) {
  const entity = await this.findOne(id); // lanza 404 si no existe
  ...
}
```

### Soft Delete

```typescript
// Eliminar → softDelete (nunca delete físico)
await this.repo.softDelete({ id });

// Restaurar
await this.repo.restore({ id });
```

### Caché

```typescript
// Patrón de registro de keys para limpieza masiva
const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
if (!keys.includes(cacheKey)) {
  keys.push(cacheKey);
  await this.cacheManager.set(listKey, keys);
}

// Limpieza masiva (llamar en create/update/remove)
private async clearQueryCache(): Promise<void> {
  const listKey = '[modulo]:query:keys';
  const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
  for (const key of keys) await this.cacheManager.del(key);
  await this.cacheManager.del(listKey);
}
```

### Queries Raw

```typescript
// Usar raw SQL solo cuando no existe entidad TypeORM para esa tabla
const [row] = await queryRunner.manager.query(
  `INSERT INTO public.tabla (campo1, campo2) VALUES ($1, $2) RETURNING id`,
  [valor1, valor2],
);
const id: number = (row as { id: number }).id;
```

---

## Flujo Completo para un Nuevo Módulo

```
1. Analizar SQL
   ├── Nombre de tabla y schema
   ├── Tipos de campos
   ├── Foreign keys (relaciones)
   ├── Índices
   └── Valores por defecto

2. Crear Entity (o ViewEntity si es vista)
   ├── Propiedades en inglés camelCase
   ├── @Column.name en español snake_case
   ├── @Index en todas las FK
   └── Timestamps: createdAt / updatedAt / deletedAt

3. Crear DTOs
   ├── create-[nombre].dto.ts
   ├── update-[nombre].dto.ts  (PartialType del Create)
   ├── query-[nombre].dto.ts   (extiende QueryPaginationDto)
   └── [nombre]-response.dto.ts

4. Crear Service
   ├── Inyectar: repo, cacheManager, dataSource, servicios dependientes
   ├── clearQueryCache() privado
   ├── CRUD: create / findAll / findOne / findOneResponse / update / remove / restore
   ├── Caché en findAll (TTL 300s) y findOne (TTL 600s)
   └── mapToResponseDto() privado

5. Crear Controller
   ├── POST   /          → create
   ├── GET    /          → findAll
   ├── GET    /:id       → findOneResponse
   ├── PATCH  /:id       → update
   ├── DELETE /:id       → remove
   └── PATCH  /:id/restore → restore

6. Crear Module
   ├── TypeOrmModule.forFeature([Entidad], DB_MAIN)
   ├── Importar módulos de dependencias
   └── exports: [NombreService]

7. Registrar en módulo padre (AppModule o módulo agrupador)
```
