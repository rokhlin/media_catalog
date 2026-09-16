import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';

export class SettingsUpdateRequestDto {
  @ApiPropertyOptional({ description: 'List of input media directories', example: ['/app/media_input', 'D:/Photos'] })
  @IsOptional()
  @IsArray()
  input_folders?: string[];

  @ApiPropertyOptional({ description: 'Output directory for database and metadata sidecars', example: '/app/media_output' })
  @IsOptional()
  @IsString()
  output_folder?: string;

  @ApiPropertyOptional({ description: 'Active Model Provider (gemini / local)', example: 'gemini' })
  @IsOptional()
  @IsString()
  model_provider?: string;

  @ApiPropertyOptional({ description: 'Gemini Model Name', example: 'gemini-3.6-flash' })
  @IsOptional()
  @IsString()
  gemini_model?: string;

  @ApiPropertyOptional({ description: 'Google Gemini API Key for backend model operations' })
  @IsOptional()
  @IsString()
  gemini_api_key?: string;

  @ApiPropertyOptional({ description: 'Explicitly remove configured Gemini API Key', example: false })
  @IsOptional()
  @IsBoolean()
  clear_gemini_api_key?: boolean;

  @ApiPropertyOptional({ description: 'Gemini rate limit in requests per minute (RPM)', example: 15 })
  @IsOptional()
  @IsNumber()
  rpm_limit?: number;

  @ApiPropertyOptional({ description: 'Local Model Name', example: 'qwen2.5-vl-7b-instruct' })
  @IsOptional()
  @IsString()
  local_model_name?: string;

  @ApiPropertyOptional({ description: 'Gemini Maximum Parallel Workers', example: 3 })
  @IsOptional()
  @IsNumber()
  gemini_max_workers?: number;

  @ApiPropertyOptional({ description: 'Local Model Maximum Parallel Workers', example: 2 })
  @IsOptional()
  @IsNumber()
  local_max_workers?: number;

  @ApiPropertyOptional({ description: 'Whisper Model Name', example: 'large-v3-turbo' })
  @IsOptional()
  @IsString()
  whisper_model?: string;

  @ApiPropertyOptional({ description: 'Preserve folder structure in output', example: true })
  @IsOptional()
  @IsBoolean()
  preserve_structure?: boolean;

  @ApiPropertyOptional({ description: 'Vision prompt template with placeholders' })
  @IsOptional()
  @IsString()
  vision_prompt_template?: string;
}
