import type { WireAuthConfig } from '@shared/auth';
import { useVariableKeys } from '../variables/use-variable-keys';
import { AuthScopePanel } from './AuthScopePanel';
import { useFolderDetail, useFolderAuthMutations } from './use-collections';

export interface FolderAuthPanelProps {
  folderId: string;
  name: string;
  onClose: () => void;
  /** Called after an "apply to children" cascade settles (refreshes open editors). */
  onApplied?: () => void;
}

/**
 * Right-pane editor for a folder's authorization. Requests and nested folders
 * that inherit resolve up to the nearest folder with a concrete config (and
 * finally the collection); "Apply to all children" sets the whole subtree to
 * inherit from here.
 */
export function FolderAuthPanel({
  folderId,
  name,
  onClose,
  onApplied,
}: FolderAuthPanelProps): JSX.Element {
  const folder = useFolderDetail(folderId);
  const { updateAuth, applyToChildren } = useFolderAuthMutations();
  const suggestions = useVariableKeys(
    folder.data ? { collectionId: folder.data.collectionId } : {},
  );

  return (
    <AuthScopePanel
      title={name}
      subtitle="Folder authorization"
      savedAuth={folder.data ? (folder.data.auth ?? { type: 'inherit' }) : undefined}
      loading={!folder.data}
      suggestions={suggestions}
      allowInherit
      saving={updateAuth.isPending}
      applying={applyToChildren.isPending}
      applyLabel="Apply to all child folders and requests"
      applyConfirmTitle="Apply to all children"
      applyConfirmMessage={`Set every folder and request inside "${name}" to inherit from parent? Their current authorization will be replaced.`}
      infoText="Requests and folders set to “Inherit from parent” use the authorization defined here. Setting this folder itself to inherit defers to its parent folder, up to the collection at the top of the chain."
      onSave={(auth: WireAuthConfig) => updateAuth.mutateAsync({ id: folderId, auth })}
      onApplyToChildren={() => applyToChildren.mutateAsync(folderId)}
      onApplied={onApplied}
      onClose={onClose}
    />
  );
}
