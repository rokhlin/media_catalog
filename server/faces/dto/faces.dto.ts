import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class RenameFaceDto {
  @ApiProperty({ description: 'Face ID in registry to rename', example: 'FACE_ID_01' })
  @IsString()
  @IsNotEmpty()
  face_id: string;

  @ApiProperty({ description: 'New human-readable name', example: 'Alex' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class AssignFaceDto {
  @ApiProperty({ description: 'Face ID to assign to person', example: 'FACE_ID_01' })
  @IsString()
  @IsNotEmpty()
  face_id: string;

  @ApiProperty({ description: 'Person name', example: 'Alex' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class AssignGroupDto {
  @ApiProperty({ description: 'Array of Face IDs to assign to person', example: ['FACE_01', 'FACE_02'] })
  @IsArray()
  @IsNotEmpty()
  face_ids: string[];

  @ApiProperty({ description: 'Person name', example: 'Alex' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class ResetFaceDto {
  @ApiProperty({ description: 'Face ID to reset back to unassigned candidate', example: 'FACE_ID_01' })
  @IsString()
  @IsNotEmpty()
  face_id: string;
}

export class ResetFaceByFilenameDto {
  @ApiProperty({ description: 'Filename or path of media whose faces to reset', example: 'photo.jpg' })
  @IsString()
  @IsNotEmpty()
  filename: string;
}

export class DeleteFaceDto {
  @ApiProperty({ description: 'Face ID to permanently delete from registry', example: 'FACE_ID_01' })
  @IsString()
  @IsNotEmpty()
  face_id: string;
}

export class DeleteFacesBatchDto {
  @ApiProperty({ description: 'Array of Face IDs to permanently delete', example: ['FACE_01', 'FACE_02'] })
  @IsArray()
  @IsNotEmpty()
  face_ids: string[];
}
