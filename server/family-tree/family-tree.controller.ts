import { Controller, Get, Post, Put, Delete, Body, Param, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FamilyTreeService } from './family-tree.service.js';
import { KinshipEngineService } from './kinship-engine.service.js';
import { FamilyEventsService } from './family-events.service.js';
import { FamilyTreePublicService } from './family-tree-public.service.js';
import {
  CreateTreeDto,
  UpdateTreeDto,
  CreatePersonDto,
  UpdatePersonDto,
  CreateUnionDto,
  UpdateUnionDto,
  AddChildToUnionDto,
  UpdateChildRelationDto,
  CreateEventDto,
  UpdateEventDto,
  PinMediaDto,
  UpdateMediaPinDto,
  LinkFaceDto,
  UnlinkFaceDto,
  QuickAddRelativeDto,
  PhotoKinshipDto,
  GalleryKinshipFactsConfigDto,
  RecordTreeHistoryDto,
} from './dto/family-tree.dto.js';

@ApiTags('family-tree')
@Controller('api/family-tree')
export class FamilyTreeController {
  constructor(
    @Inject(FamilyTreeService) private readonly treeService: FamilyTreeService,
    @Inject(KinshipEngineService) private readonly kinshipService: KinshipEngineService,
    @Inject(FamilyEventsService) private readonly eventsService: FamilyEventsService,
    @Inject(FamilyTreePublicService) private readonly publicService: FamilyTreePublicService,
  ) {}

  // ---------------------------------------------------------------------------
  // Tree Endpoints
  // ---------------------------------------------------------------------------

  @Get('trees')
  @ApiOperation({ summary: 'List all family trees' })
  async listTrees() {
    return this.treeService.getTrees();
  }

  @Get('trees/default')
  @ApiOperation({ summary: 'Get or initialize the default family tree' })
  async getDefaultTree() {
    return this.treeService.getOrCreateDefaultTree();
  }

  @Get('trees/:id')
  @ApiOperation({ summary: 'Get family tree metadata by ID' })
  async getTreeById(@Param('id') id: string) {
    return this.treeService.getTreeById(id);
  }

  @Post('trees')
  @ApiOperation({ summary: 'Create a new family tree' })
  async createTree(@Body() body: CreateTreeDto) {
    return this.treeService.createTree(body);
  }

  @Put('trees/:id')
  @ApiOperation({ summary: 'Update family tree metadata' })
  async updateTree(@Param('id') id: string, @Body() body: UpdateTreeDto) {
    return this.treeService.updateTree(id, body);
  }

  @Delete('trees/:id')
  @ApiOperation({ summary: 'Delete a family tree and all linked nodes' })
  async deleteTree(@Param('id') id: string) {
    this.treeService.deleteTree(id);
    return { success: true, deletedId: id };
  }

  @Post('trees/:id/root/:personId')
  @ApiOperation({ summary: 'Set the root ("ME") anchor person for a tree' })
  async setRootPerson(@Param('id') id: string, @Param('personId') personId: string) {
    return this.treeService.setRootPerson(id, personId);
  }

  @Get('graph')
  @ApiOperation({ summary: 'Get complete graph nodes and edges for the default tree' })
  async getDefaultGraph() {
    return this.treeService.getTreeGraph();
  }

  @Get('trees/:id/graph')
  @ApiOperation({ summary: 'Get complete graph nodes and edges for a specific tree' })
  async getTreeGraph(@Param('id') id: string) {
    return this.treeService.getTreeGraph(id);
  }

  @Get('trees/:id/history')
  @ApiOperation({ summary: 'Get chronological history and audit logs for a tree' })
  async getTreeHistory(@Param('id') id: string, @Query('limit') limit?: string) {
    const num = limit ? parseInt(limit, 10) : 50;
    return this.treeService.getTreeHistory(id, num);
  }

  @Post('trees/:id/history')
  @ApiOperation({ summary: 'Record an audit log or history event for a tree' })
  async recordTreeHistory(@Param('id') id: string, @Body() body: RecordTreeHistoryDto) {
    return this.treeService.recordTreeHistory(id, body.action_type, body.description, body.details);
  }

  // ---------------------------------------------------------------------------
  // Person Endpoints
  // ---------------------------------------------------------------------------

  @Get('persons')
  @ApiOperation({ summary: 'List persons with optional search query and tree filter' })
  @ApiQuery({ name: 'treeId', required: false, type: String })
  @ApiQuery({ name: 'query', required: false, type: String })
  async listPersons(@Query('treeId') treeId?: string, @Query('query') query?: string) {
    return this.treeService.listPersons(treeId, query);
  }

  @Get('persons/:id')
  @ApiOperation({ summary: 'Get person details by ID' })
  async getPersonById(@Param('id') id: string) {
    return this.treeService.getPersonById(id);
  }

  @Post('persons')
  @ApiOperation({ summary: 'Create a new person in the family tree' })
  async createPerson(@Body() body: CreatePersonDto) {
    return this.treeService.createPerson(body);
  }

  @Put('persons/:id')
  @ApiOperation({ summary: 'Update person details' })
  async updatePerson(@Param('id') id: string, @Body() body: UpdatePersonDto) {
    return this.treeService.updatePerson(id, body);
  }

  @Delete('persons/:id')
  @ApiOperation({ summary: 'Delete person and clean up relationships' })
  async deletePerson(@Param('id') id: string) {
    this.treeService.deletePerson(id);
    return { success: true, deletedId: id };
  }

  @Post('persons/quick-add')
  @ApiOperation({ summary: 'Quick add a relative (Parent, Child, Spouse, Sibling)' })
  async quickAddRelative(@Body() body: QuickAddRelativeDto) {
    return this.treeService.quickAddRelative(body);
  }

  // ---------------------------------------------------------------------------
  // Union & Child Endpoints
  // ---------------------------------------------------------------------------

  @Post('unions')
  @ApiOperation({ summary: 'Create a new union junction with partners' })
  async createUnion(@Body() body: CreateUnionDto) {
    return this.treeService.createUnion(body);
  }

  @Get('unions/:id')
  @ApiOperation({ summary: 'Get union junction details by ID' })
  async getUnionById(@Param('id') id: string) {
    return this.treeService.getUnionById(id);
  }

  @Put('unions/:id')
  @ApiOperation({ summary: 'Update union junction' })
  async updateUnion(@Param('id') id: string, @Body() body: UpdateUnionDto) {
    return this.treeService.updateUnion(id, body);
  }

  @Delete('unions/:id')
  @ApiOperation({ summary: 'Delete union junction' })
  async deleteUnion(@Param('id') id: string) {
    this.treeService.deleteUnion(id);
    return { success: true, deletedId: id };
  }

  @Post('unions/:id/partners/:personId')
  @ApiOperation({ summary: 'Add a partner to an existing union' })
  async addPartner(@Param('id') id: string, @Param('personId') personId: string) {
    this.treeService.addPartnerToUnion(id, personId);
    return { success: true };
  }

  @Delete('unions/:id/partners/:personId')
  @ApiOperation({ summary: 'Remove a partner from a union' })
  async removePartner(@Param('id') id: string, @Param('personId') personId: string) {
    this.treeService.removePartnerFromUnion(id, personId);
    return { success: true };
  }

  @Post('unions/:id/children')
  @ApiOperation({ summary: 'Add a child person to a union' })
  async addChild(@Param('id') id: string, @Body() body: AddChildToUnionDto) {
    this.treeService.addChildToUnion(id, body);
    return { success: true };
  }

  @Delete('unions/:id/children/:personId')
  @ApiOperation({ summary: 'Remove child from a union' })
  async removeChild(@Param('id') id: string, @Param('personId') personId: string) {
    this.treeService.removeChildFromUnion(id, personId);
    return { success: true };
  }

  @Put('unions/:id/children/:personId')
  @ApiOperation({ summary: 'Update child filiation or birth order' })
  async updateChildRelation(
    @Param('id') id: string,
    @Param('personId') personId: string,
    @Body() body: UpdateChildRelationDto,
  ) {
    this.treeService.updateChildRelation(id, personId, body);
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Timeline, Events & Media Pins
  // ---------------------------------------------------------------------------

  @Get('persons/:id/timeline')
  @ApiOperation({ summary: 'Get complete chronological life timeline with auto and manual facts' })
  async getPersonTimeline(@Param('id') id: string) {
    return this.eventsService.getPersonTimeline(id);
  }

  @Post('persons/:id/events')
  @ApiOperation({ summary: 'Create a life fact/event for a person' })
  async createEvent(@Param('id') id: string, @Body() body: CreateEventDto) {
    return this.eventsService.createEvent(id, body);
  }

  @Get('events/:eventId')
  @ApiOperation({ summary: 'Get life fact/event details with pinned gallery media' })
  async getEventById(@Param('eventId') eventId: string) {
    return this.eventsService.getEventById(eventId);
  }

  @Put('events/:eventId')
  @ApiOperation({ summary: 'Update a life fact/event' })
  async updateEvent(@Param('eventId') eventId: string, @Body() body: UpdateEventDto) {
    return this.eventsService.updateEvent(eventId, body);
  }

  @Delete('events/:eventId')
  @ApiOperation({ summary: 'Delete a life fact/event' })
  async deleteEvent(@Param('eventId') eventId: string) {
    this.eventsService.deleteEvent(eventId);
    return { success: true, deletedId: eventId };
  }

  @Post('events/:eventId/pin-media')
  @ApiOperation({ summary: 'Pin a gallery media photo/video to a life fact' })
  async pinMedia(@Param('eventId') eventId: string, @Body() body: PinMediaDto) {
    return this.eventsService.pinMediaToEvent(eventId, body);
  }

  @Put('media-pins/:pinId')
  @ApiOperation({ summary: 'Update pinned media metadata (caption, order)' })
  async updateMediaPin(@Param('pinId') pinId: string, @Body() body: UpdateMediaPinDto) {
    return this.eventsService.updateMediaPin(pinId, body);
  }

  @Delete('media-pins/:pinId')
  @ApiOperation({ summary: 'Unpin media from a life fact' })
  async unpinMedia(@Param('pinId') pinId: string) {
    this.eventsService.unpinMedia(pinId);
    return { success: true, deletedId: pinId };
  }

  // ---------------------------------------------------------------------------
  // Kinship Calculation
  // ---------------------------------------------------------------------------

  @Get('kinship')
  @ApiOperation({ summary: 'Calculate kinship taxonomy between reference person and target person' })
  @ApiQuery({ name: 'rootPersonId', required: true, type: String })
  @ApiQuery({ name: 'targetPersonId', required: true, type: String })
  async calculateKinship(
    @Query('rootPersonId') rootPersonId: string,
    @Query('targetPersonId') targetPersonId: string,
  ) {
    return this.kinshipService.calculateKinship(rootPersonId, targetPersonId);
  }

  // ---------------------------------------------------------------------------
  // Public API Endpoints (For Media Cataloger Consumption)
  // ---------------------------------------------------------------------------

  @Get('public/person-context')
  @ApiOperation({ summary: 'Get rich genealogical profile, kinship data, and recent life milestones for recognized face/name' })
  @ApiQuery({ name: 'name', required: false, type: String })
  @ApiQuery({ name: 'mediaPersonId', required: false, type: String })
  @ApiQuery({ name: 'faceId', required: false, type: String })
  @ApiQuery({ name: 'personId', required: false, type: String })
  @ApiQuery({ name: 'treeId', required: false, type: String })
  async getPersonContext(
    @Query('name') name?: string,
    @Query('mediaPersonId') mediaPersonId?: string,
    @Query('faceId') faceId?: string,
    @Query('personId') personId?: string,
    @Query('treeId') treeId?: string,
  ) {
    return this.publicService.getPersonContext({ name, mediaPersonId, faceId, personId, treeId });
  }

  @Post('public/photo-kinship')
  @ApiOperation({ summary: 'Analyze photo face group, deduce mutual relationships and contextual captions' })
  async analyzePhotoKinship(@Body() body: PhotoKinshipDto) {
    return this.publicService.analyzePhotoKinship(body);
  }

  @Get('public/gallery-facts-config')
  @ApiOperation({ summary: 'Get persistent configuration for Kinship facts in media gallery' })
  async getGalleryKinshipFactsConfig() {
    return this.publicService.getGalleryKinshipFactsConfig();
  }

  @Post('public/gallery-facts-config')
  @ApiOperation({ summary: 'Save persistent configuration for Kinship facts in media gallery' })
  async saveGalleryKinshipFactsConfig(@Body() body: GalleryKinshipFactsConfigDto) {
    return this.publicService.saveGalleryKinshipFactsConfig(body);
  }

  @Get('public/autocomplete')
  @ApiOperation({ summary: 'Fast autocomplete search index with kinship badges' })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'treeId', required: false, type: String })
  async getAutocomplete(@Query('query') query?: string, @Query('treeId') treeId?: string) {
    return this.publicService.getAutocomplete(query, treeId);
  }

  // ---------------------------------------------------------------------------
  // Face Linking
  // ---------------------------------------------------------------------------

  @Post('link-face')
  @ApiOperation({ summary: 'Link a Tree Person to a Media Cataloger recognized face crop' })
  async linkFace(@Body() body: LinkFaceDto) {
    return this.treeService.linkPersonFace(body);
  }

  @Post('unlink-face')
  @ApiOperation({ summary: 'Unlink face crop from Tree Person via body parameters' })
  async unlinkFaceBody(@Body() body: UnlinkFaceDto) {
    if (body.link_id) {
      this.treeService.unlinkPersonFace(body.link_id);
    } else if (body.tree_person_id) {
      const links = this.treeService.getPersonFaceLinks(body.tree_person_id);
      const target = body.media_face_id
        ? links.find((l) => l.media_face_id === body.media_face_id)
        : links[0];
      if (target) {
        this.treeService.unlinkPersonFace(target.id);
      }
    }
    return { success: true };
  }

  @Delete('link-face/:linkId')
  @ApiOperation({ summary: 'Unlink a face crop from a Tree Person' })
  async unlinkFace(@Param('linkId') linkId: string) {
    this.treeService.unlinkPersonFace(linkId);
    return { success: true, deletedId: linkId };
  }

  @Get('persons/:id/faces')
  @ApiOperation({ summary: 'Get all linked face crops for a Tree Person' })
  async getPersonFaceLinks(@Param('id') id: string) {
    return this.treeService.getPersonFaceLinks(id);
  }
}
