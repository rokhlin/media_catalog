import DuplicatesManagerTab from '../components/duplicates';

export interface DuplicatesScreenProps {
  onRefreshMedia: (force?: boolean) => void | Promise<void>;
  activeInputFolders: string[];
  onOpenViewer?: (filePath: string) => void;
}

export default function DuplicatesScreen({
  onRefreshMedia,
  activeInputFolders,
  onOpenViewer,
}: DuplicatesScreenProps) {
  return (
    <div className="tab-pane active" id="pane-duplicates">
      <DuplicatesManagerTab
        onRefreshMedia={onRefreshMedia}
        activeInputFolders={activeInputFolders}
        onOpenViewer={onOpenViewer}
      />
    </div>
  );
}

export { DuplicatesScreen };
