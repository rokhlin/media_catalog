import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddPersonToFileDto {
  @ApiProperty({ description: 'File path or filename of the media item', example: 'photos/vacation.jpg' })
  @IsString()
  @IsNotEmpty()
  file: string;

  @ApiProperty({ description: 'Name of the person to link to this media file', example: 'Alice Smith' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class RemoveFaceFromFileDto {
  @ApiProperty({ description: 'File path or filename of the media item', example: 'photos/vacation.jpg' })
  @IsString()
  @IsNotEmpty()
  file: string;

  @ApiProperty({ description: 'Face ID to unlink from this file', example: 'face_123' })
  @IsString()
  @IsNotEmpty()
  face_id: string;
}

export class ListMediaFilesQueryDto {
  @ApiProperty({ required: false, description: 'Page offset (0-indexed)', example: 0 })
  offset?: number;

  @ApiProperty({ required: false, description: 'Max items per page/chunk', example: 50 })
  limit?: number;

  @ApiProperty({ required: false, description: 'Page number (1-indexed)', example: 1 })
  page?: number;

  @ApiProperty({ required: false, description: 'Search term for file name, description, person, or folder', example: 'beach' })
  search?: string;

  @ApiProperty({ required: false, enum: ['all', 'images', 'videos'], description: 'Media type filter' })
  type?: 'all' | 'images' | 'videos';

  @ApiProperty({ required: false, enum: ['all', 'PROCESSED', 'UNPROCESSED', 'PENDING'], description: 'Processing status filter' })
  status?: 'all' | 'PROCESSED' | 'UNPROCESSED' | 'PENDING';

  @ApiProperty({ required: false, enum: ['all', 'with_faces', 'no_faces', 'unassigned'], description: 'Face detection filter' })
  face_filter?: 'all' | 'with_faces' | 'no_faces' | 'unassigned';

  @ApiProperty({ required: false, description: 'Filter by person name', example: 'Alice' })
  person?: string;

  @ApiProperty({ required: false, description: 'Filter by folder subpath or base folder' })
  folder?: string;

  @ApiProperty({ required: false, enum: ['name', 'date', 'size', 'status', 'faces'], description: 'Field to sort by' })
  sort_by?: 'name' | 'date' | 'size' | 'status' | 'faces';

  @ApiProperty({ required: false, enum: ['asc', 'desc'], description: 'Sort direction' })
  sort_order?: 'asc' | 'desc';

  @ApiProperty({ required: false, description: 'Force refresh and bust scan cache', example: false })
  refresh?: boolean | string;

  @ApiProperty({ required: false, enum: ['false', 'true', 'all'], description: 'Vault filter mode. Defaults to false (excludes secret vault items)' })
  vault?: 'false' | 'true' | 'all';
}

export class UpdateMediaMetadataDto {
  @ApiProperty({ description: 'File path or filename of the media item to update', example: 'photos/vacation.jpg' })
  @IsString()
  @IsNotEmpty()
  file: string;

  @ApiProperty({ required: false, description: 'English summary of the media item' })
  summary?: string;

  @ApiProperty({ required: false, description: 'Russian summary of the media item' })
  summary_ru?: string;

  @ApiProperty({ required: false, description: 'Detailed English description' })
  description?: string;

  @ApiProperty({ required: false, description: 'Detailed Russian description' })
  description_ru?: string;

  @ApiProperty({ required: false, description: 'Scene environment (e.g. indoor, outdoor)', example: 'outdoor' })
  environment?: string;

  @ApiProperty({ required: false, description: 'Lighting condition (English)', example: 'natural golden hour' })
  lighting?: string;

  @ApiProperty({ required: false, description: 'Lighting condition (Russian)', example: 'естественный золотой час' })
  lighting_ru?: string;

  @ApiProperty({ required: false, description: 'Weather condition (English)', example: 'sunny clear sky' })
  weather?: string;

  @ApiProperty({ required: false, description: 'Weather condition (Russian)', example: 'солнечно, ясно' })
  weather_ru?: string;

  @ApiProperty({ required: false, description: 'Time of day (English)', example: 'sunset' })
  time_of_day?: string;

  @ApiProperty({ required: false, description: 'Time of day (Russian)', example: 'закат' })
  time_of_day_ru?: string;

  @ApiProperty({ required: false, description: 'OCR text detected in image' })
  ocr_text?: string;

  @ApiProperty({ required: false, description: 'Camera manufacturer / make', example: 'Sony' })
  camera_make?: string;

  @ApiProperty({ required: false, description: 'Camera model', example: 'ILCE-7RM4' })
  camera_model?: string;

  @ApiProperty({ required: false, description: 'Camera lens model', example: 'FE 24-70mm F2.8 GM' })
  lens_model?: string;

  @ApiProperty({ required: false, description: 'Location / Landmark name', example: 'Central Park, New York' })
  location_name?: string;

  @ApiProperty({ required: false, description: 'Capture date/time in ISO or YYYY-MM-DD format', example: '2024-05-18' })
  media_date?: string;

  @ApiProperty({ required: false, description: 'Audio speech transcription (English)' })
  transcription?: string;

  @ApiProperty({ required: false, description: 'Audio speech transcription (Russian)' })
  transcription_ru?: string;

  @ApiProperty({ required: false, description: 'Timeline events for video clips' })
  timeline_events?: any;

  @ApiProperty({ required: false, description: 'Tags or keywords for media classification', example: ['vacation', 'family', 'beach'] })
  tags?: string[] | string;
}


