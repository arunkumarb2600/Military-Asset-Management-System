import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

const ReferenceContext = createContext({ bases: [], equipmentTypes: [], loading: true });

/**
 * Loads the reference lists (bases + equipment types) once per session and
 * shares them.  The backend already narrows `bases` to the user's own base
 * for non-admins, so the UI never has to hide anything itself.
 */
export function ReferenceProvider({ children }) {
  const { user } = useAuth();
  const [bases, setBases] = useState([]);
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    Promise.all([api.bases(), api.equipmentTypes()])
      .then(([b, e]) => {
        if (!alive) return;
        setBases(b.bases);
        setEquipmentTypes(e.equipmentTypes);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [user]);

  return (
    <ReferenceContext.Provider value={{ bases, equipmentTypes, loading }}>
      {children}
    </ReferenceContext.Provider>
  );
}

export const useReference = () => useContext(ReferenceContext);
