import type { WireAuthConfig } from '@shared/auth';
import { useVariableKeys } from '../variables/use-variable-keys';
import { AuthScopePanel } from './AuthScopePanel';
import { useCollectionDetail, useCollectionAuthMutations } from './use-collections';

export interface CollectionAuthPanelProps {
  collectionId: string;
  name: string;
  onClose: () => void;
  /** Called after an "apply to children" cascade settles (refreshes open editors). */
  onApplied?: () => void;
}

/**
 * Right-pane editor for a collection's authorization — the top of the
 * inheritance chain. A request/folder set to inherit that reaches the top of its
 * folders falls back to this config. The collection cannot itself inherit.
 */
export function CollectionAuthPanel({
  collectionId,
  name,
  onClose,
  onApplied,
}: CollectionAuthPanelProps): JSX.Element {
  const collection = useCollectionDetail(collectionId);
  const { updateAuth, applyToChildren } = useCollectionAuthMutations();
  const suggestions = useVariableKeys({ collectionId });

  return (
    <AuthScopePanel
      title={name}
      subtitle="Collection authorization"
      savedAuth={collection.data ? (collection.data.auth ?? { type: 'none' }) : undefined}
      loading={!collection.data}
      suggestions={suggestions}
      allowInherit={false}
      saving={updateAuth.isPending}
      applying={applyToChildren.isPending}
      applyLabel="Apply to all folders and requests"
      applyConfirmTitle="Apply to all children"
      applyConfirmMessage={`Set every folder and request in "${name}" to inherit from parent? Their current authorization will be replaced.`}
      infoText="This is the top of the inheritance chain. Requests and folders that inherit past their folders fall back to this authorization."
      onSave={(auth: WireAuthConfig) => updateAuth.mutateAsync({ id: collectionId, auth })}
      onApplyToChildren={() => applyToChildren.mutateAsync(collectionId)}
      onApplied={onApplied}
      onClose={onClose}
    />
  );
}
