import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UnauthorizedException,
  BadRequestException,
  UseGuards,
  Inject,
  Res,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service.js';
import { LoginDto, CreateUserDto, UpdateUserDto, UpdateProfileDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto.js';
import { Public, Roles, RequirePermissions, CurrentUser } from './auth.decorators.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@ApiTags('auth')
@Controller('api/auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Log in with username and password' })
  @ApiResponse({ status: 200, description: 'Authentication token and user details' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
    const user = await this.authService.validateUser(dto.username, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const result = await this.authService.login(user);
    if (res && res.cookie) {
      res.cookie('media_cataloger_session', result.token, {
        path: '/',
        httpOnly: false,
        sameSite: 'lax',
        maxAge: 7 * 86400 * 1000,
      });
    }
    return result;
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Initiate password recovery check for a user' })
  @ApiResponse({ status: 200, description: 'User recovery status and hints' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.checkPasswordRecovery(dto.username);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset user password using a recovery key' })
  @ApiResponse({ status: 200, description: 'Password reset status' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPasswordWithRecoveryKey(dto);
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User created and logged in with token' })
  async register(@Body() dto: CreateUserDto, @Res({ passthrough: true }) res: any) {
    const existingUsers = this.authService.listUsers();
    const role = dto.role || (existingUsers.length === 0 ? 'admin' : 'editor');
    const createdUser = this.authService.createUser({ ...dto, role });
    const result = await this.authService.login(createdUser);
    if (res && res.cookie) {
      res.cookie('media_cataloger_session', result.token, {
        path: '/',
        httpOnly: false,
        sameSite: 'lax',
        maxAge: 7 * 86400 * 1000,
      });
    }
    return result;
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Log out current session' })
  async logout(@Res({ passthrough: true }) res: any) {
    if (res && res.clearCookie) {
      res.clearCookie('media_cataloger_session', { path: '/' });
    }
    return { success: true, message: 'Logged out successfully' };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get profile of current authenticated user' })
  async getProfile(@CurrentUser() user: any) {
    if (!user) {
      return {
        authenticated: false,
        user: null,
      };
    }
    const fullUser = this.authService.getUserById(user.sub);
    return {
      authenticated: true,
      user: fullUser || user,
    };
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change password of current authenticated user' })
  async changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    if (!user?.sub) {
      throw new UnauthorizedException('Authentication required');
    }
    const success = this.authService.changePassword(user.sub, dto);
    return { success, message: 'Password updated successfully' };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update profile (name, email, avatar) of current authenticated user' })
  async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    if (!user?.sub) {
      throw new UnauthorizedException('Authentication required');
    }
    const updated = this.authService.updateProfile(user.sub, dto);
    return { success: true, user: updated };
  }

  @Post('avatar-video')
  @UseInterceptors(FileInterceptor('video'))
  @ApiOperation({ summary: 'Upload trimmed video avatar' })
  @ApiConsumes('multipart/form-data')
  async uploadAvatarVideo(@CurrentUser() user: any, @UploadedFile() file: any) {
    if (!user?.sub) {
      throw new UnauthorizedException('Authentication required');
    }
    if (!file || !file.buffer) {
      throw new BadRequestException('No video file provided');
    }
    const filename = this.authService.saveAvatarVideo(user.sub, file.buffer, file.originalname);
    const videoUrl = `/api/auth/avatar-video/${filename}`;
    const updated = this.authService.updateProfile(user.sub, {
      avatarVideoUrl: videoUrl,
      avatarType: 'video',
    });
    return {
      success: true,
      videoUrl,
      user: updated,
    };
  }

  @Public()
  @Get('avatar-video/:filename')
  @ApiOperation({ summary: 'Stream user avatar video' })
  streamAvatarVideo(@Param('filename') filename: string, @Res() res: any) {
    this.authService.streamAvatarVideo(filename, res);
  }

  // --- User Administration (Admin or manage_users) ---
  @Get('users')
  @Roles('admin')
  @RequirePermissions('manage_users')
  @ApiOperation({ summary: 'List all user accounts (Admin / manage_users)' })
  async listUsers() {
    return this.authService.listUsers();
  }

  @Post('users')
  @Roles('admin')
  @RequirePermissions('manage_users')
  @ApiOperation({ summary: 'Create a new user account' })
  async createUser(@Body() dto: CreateUserDto) {
    return this.authService.createUser(dto);
  }

  @Patch('users/:id')
  @Roles('admin')
  @RequirePermissions('manage_users')
  @ApiOperation({ summary: 'Update an existing user account' })
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.authService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @Roles('admin')
  @RequirePermissions('manage_users')
  @ApiOperation({ summary: 'Delete a user account' })
  async deleteUser(@Param('id') id: string, @CurrentUser() currentUser: any) {
    const success = this.authService.deleteUser(id, currentUser?.sub);
    return { success, message: 'User deleted successfully' };
  }
}
