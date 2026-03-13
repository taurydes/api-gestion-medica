import { ApiProperty } from "@nestjs/swagger";
import { IsOptional } from "class-validator";
import { QueryPaginationDto } from "src/common/dto/query-pagination.dto";

export class QueryPermissionDto extends QueryPaginationDto {

    @ApiProperty({
        description: 'Texto para búsqueda parcial en el nombre o descripción de los permisos.',
        required: false,
    })
    @IsOptional()
    search?: string;
    
    @ApiProperty({
        description: 'Indica si el permiso está activo.',
        required: false,
    })
    @IsOptional()
    isActive?: boolean;


}