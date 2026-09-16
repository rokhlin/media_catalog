import { IsString, IsNotEmpty, IsOptional, IsArray, IsIn, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Username', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ description: 'Password', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class CreateUserDto {
  @ApiProperty({ description: 'Username', example: 'editor_jane' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  username!: string;

  @ApiPropertyOptional({ description: 'Display name', example: 'Jane Doe' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiProperty({ description: 'Password', example: 'SecretPassword123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  password!: string;

  @ApiProperty({ description: 'Role', enum: ['admin', 'editor', 'viewer'], example: 'editor' })
  @IsString()
  @IsIn(['admin', 'editor', 'viewer'])
  role!: 'admin' | 'editor' | 'viewer';

  @ApiPropertyOptional({ description: 'Permissions list', type: [String], example: ['view_media', 'edit_metadata'] })
  @IsArray()
  @IsOptional()
  permissions?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Display name' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ description: 'New password (optional)' })
  @IsString()
  @IsOptional()
  @MinLength(4)
  password?: string;

  @ApiPropertyOptional({ description: 'Role', enum: ['admin', 'editor', 'viewer'] })
  @IsString()
  @IsOptional()
  @IsIn(['admin', 'editor', 'viewer'])
  role?: 'admin' | 'editor' | 'viewer';

  @ApiPropertyOptional({ description: 'Permissions list', type: [String] })
  @IsArray()
  @IsOptional()
  permissions?: string[];
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ description: 'New password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  newPassword!: string;
}
