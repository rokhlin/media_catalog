import { FamilyTreeTab } from '../packages/family-tree/index';

export default function FamilyTreeScreen() {
  return (
    <div
      className="tab-pane active"
      id="pane-family-tree"
      style={{ width: '100%', height: 'calc(100vh - 120px)', minHeight: 650, position: 'relative' }}
    >
      <FamilyTreeTab />
    </div>
  );
}

export { FamilyTreeScreen };
