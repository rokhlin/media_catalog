import type { FaceItem, FaceDetail, PersonItem, UnrecognizedGroupItem } from './face';

export interface ExpandedModalState {
  title: string;
  items: FaceItem[];
  type: 'group' | 'person';
  data: PersonItem | UnrecognizedGroupItem | Record<string, unknown>;
}

export interface SourceImageModalState {
  isOpen: boolean;
  sourceFile: string;
  face: FaceItem | FaceDetail | null;
}
