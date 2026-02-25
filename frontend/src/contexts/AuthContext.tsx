import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  company_id: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  company: string | null;
  companyId: string | null;
  login: (data: any) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    const storedCompany = localStorage.getItem('company');
    const storedCompanyId = localStorage.getItem('companyId');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      setCompany(storedCompany);
      setCompanyId(storedCompanyId);

      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` }
      })
      .then(res => {
        if (res.ok) return res.json();
        if (res.status === 401) {
          localStorage.clear();
          window.location.href = '/login';
          throw new Error('Session expired');
        }
        throw new Error('Failed to refresh');
      })
      .then(userData => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      })
      .catch(err => console.error("Session refresh error:", err));
    }
  }, []);

  const login = (data: any) => {
    setToken(data.token);
    setUser(data.user);
    setCompany(data.company_name);
    setCompanyId(data.company_id);

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('company', data.company_name || '');
    localStorage.setItem('companyId', data.company_id || '');
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setCompany(null);
    setCompanyId(null);
    localStorage.clear();
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      company,
      companyId,
      login,
      logout,
      isAuthenticated: !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
