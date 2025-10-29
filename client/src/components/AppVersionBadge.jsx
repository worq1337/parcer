import React from 'react';

const initialMeta = {
  version: '—',
  build: '',
  name: 'Receipt Parser',
  builtAt: ''
};

const resolveTitle = (meta) => {
  const parts = [];
  if (meta.build) {
    parts.push(`build ${meta.build}`);
  }
  if (meta.builtAt) {
    parts.push(`built at ${meta.builtAt}`);
  }
  return parts.length ? parts.join(', ') : 'build dev';
};

export function AppVersionBadge({ className = '' }) {
  const [meta, setMeta] = React.useState(initialMeta);

  React.useEffect(() => {
    let cancelled = false;
    const loadMeta = async () => {
      try {
        if (window.appInfo?.getMeta) {
          const result = await window.appInfo.getMeta();
          if (!cancelled && result) {
            setMeta({
              version: result.version || initialMeta.version,
              build: result.build || initialMeta.build,
              name: result.name || initialMeta.name,
              builtAt: result.builtAt || initialMeta.builtAt
            });
            return;
          }
        }
      } catch (error) {
        console.error('[AppVersionBadge] failed to load app meta', error);
      }
      if (!cancelled) {
        setMeta(initialMeta);
      }
    };

    loadMeta();

    return () => {
      cancelled = true;
    };
  }, []);

  const shortBuild = meta.build ? meta.build.slice(0, 7) : '';
  const tooltip = resolveTitle(meta);

  return (
    <span className={`app-version-badge ${className}`.trim()} title={tooltip}>
      v{meta.version}
      {shortBuild ? ` (${shortBuild})` : ''}
    </span>
  );
}

export default AppVersionBadge;
