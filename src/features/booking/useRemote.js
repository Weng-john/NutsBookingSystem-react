import { useCallback, useEffect, useState } from "react";

export default function useRemote(loader) {
  const [state, setState] = useState({ data: null, error: "", loader: null, revision: -1 }), [revision, setRevision] = useState(0);
  const loading = state.loader !== loader || state.revision !== revision;
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      Promise.resolve().then(loader).then(data => { if (active) setState({ data, error: "", loader, revision }); }).catch(error => { if (active) setState({ data: null, error: error.message, loader, revision }); });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [loader, revision]);
  const refresh = useCallback(() => { setRevision(value => value + 1); }, []);
  return { data: loading ? null : state.data, previousData: state.data, error: loading ? "" : state.error, loading, refresh };
}
