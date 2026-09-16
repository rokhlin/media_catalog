import { IsString, IsNotEmpty, IsOptional, MinLength, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetupVaultDto {
  @ApiProperty({ description: 'PIN or Master Passphrase (minimum 4 characters)', example: '1234' })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  pin!: string;

  @ApiPropertyOptional({ description: 'Optional designated vault folder path or name', example: 'vault' })
  @IsString()
  @IsOptional()
  vaultFolder?: string;

  @ApiPropertyOptional({ description: 'Auto-lock inactivity minutes (default 15)', example: 15 })
  @IsNumber()
  @IsOptional()
  autoLockMinutes?: number;
}

export class UnlockVaultDto {
  @ApiProperty({ description: 'PIN or Master Passphrase', example: '1234' })
  @IsString()
  @IsNotEmpty()
  pin!: string;
}

export class VaultItemActionDto {
  @ApiProperty({ description: 'File path to add or remove from secret vault', example: 'media_input/private_photo.jpg' })
  @IsString()
  @IsNotEmpty()
  filePath!: string;

  @ApiPropertyOptional({ description: 'Optional private note' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateVaultConfigDto {
  @ApiPropertyOptional({ description: 'Current PIN' })
  @IsString()
  @IsOptional()
  currentPin?: string;

  @ApiPropertyOptional({ description: 'New PIN' })
  @IsString()
  @IsOptional()
  @MinLength(4)
  newPin?: string;

  @ApiPropertyOptional({ description: 'Designated vault folder name or subpath' })
  @IsString()
  @IsOptional()
  vaultFolder?: string;

  @ApiPropertyOptional({ description: 'Enable/disable vault' })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Auto lock timeout in minutes' })
  @IsNumber()
  @IsOptional()
  autoLockMinutes?: number;
}
