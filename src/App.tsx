/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './lib/supabase';
import {
  LayoutDashboard,
  Package,
  BarChart3,
  Settings,
  Bell,
  User,
  Plus,
  Search,
  Filter,
  ChevronRight,
  MapPin,
  Clock,
  Truck,
  Ship,
  Plane,
  Zap,
  ArrowLeft,
  CheckCircle2,
  Circle,
  MoreVertical,
  Download,
  FileText,
  AlertTriangle,
  Calculator,
  Box,
  CreditCard,
  ScrollText,
  ShieldCheck,
  Users,
  Lock,
  LogOut,
  Mail,
  Key,
  Trash2,
  Calendar,
  Camera,
  Route,
  History,
  X,
  MessageSquare,
  Bot,
  Send,
  Sparkles,
  Edit2,
  Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type TransportMode = 'Road' | 'Maritime' | 'Air' | 'Express';
type ShipmentStatus = 'on-route' | 'delayed' | 'pending' | 'loading' | 'completed';

interface Checkpoint {
  id: string;
  label: string;
  status: 'pending' | 'completed' | 'current';
  timestamp?: string;
  location?: string;
  details?: string;
  plannedDate?: string;
  actualDate?: string;
  duration?: number;
}

type UserRole = 'super-admin' | 'company-admin' | 'analyst' | 'user';
type PermissionType = 'view' | 'edit';

interface Profile {
  id: string;
  email: string;
  role: UserRole;
  company_id?: string;
  company_name?: string;
}

interface ModuleAccess {
  module_id: string;
  permission_type: PermissionType;
}

interface Shipment {
  id: string;
  code: string;
  mode: TransportMode;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  checkpoints: Checkpoint[];
  leadTime: number;
  currentTransitTime: number;
  departureDate: string;
  carrier: string;
  cargoType: 'Lotação' | 'Fracionado';
  cargoDescription: string;
  value: string;
  plate: string;
  seals: string;
  booking: string;
  trackingTag: string;
  invoices: { nf: string; value: string }[];
  invoiceFileUrl?: string;
  invoiceFileName?: string;
  shipName?: string;
  sszArrivalDate?: string;
}

interface Payment {
  id: string;
  company_id: string;
  type: 'monthly' | 'extra';
  document_type: 'NF' | 'ND';
  document_number?: string;
  title?: string;
  amount: number;
  description: string;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue' | 'in_progress';
  paid_at?: string;
  created_at: string;
}

interface FleetRegistration {
  id: string;
  company_id: string;
  carrier: string;
  vehicle_plate: string;
  driver_name: string;
  seals: string[];
  photos: { url: string; name: string; type: string }[];
  status: 'draft' | 'finalized';
  notes?: string;
  created_at: string;
}

interface RouteStop {
  id: string;
  city: string;
  state: string;
  distanceFromMAO: number;
}

interface Document {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  type: string;
  issue_date?: string;
  expiry_date?: string;
  file_url?: string;
  company_id: string;
  created_at: string;
  created_by?: string;
}

// --- Constants ---

const isCheckpointDelayed = (cp: Checkpoint) => {
  if (cp.actualDate) return false;
  if (!cp.plannedDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const planned = new Date(cp.plannedDate);
  return today > planned;
};

const getTransitMetrics = (shipment: Shipment) => {
  const departureDate = new Date(shipment.departureDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Current Transit Days
  let lastCompletedDate = departureDate;
  (shipment.checkpoints || []).forEach(cp => {
    if (cp.actualDate) {
      const d = new Date(cp.actualDate);
      if (d > lastCompletedDate) lastCompletedDate = d;
    }
  });

  const isCompleted = (shipment.checkpoints || []).every(cp => cp.status === 'completed');
  const referenceDate = isCompleted ? lastCompletedDate : today;
  const currentTransitTime = Math.max(0, Math.ceil((referenceDate.getTime() - departureDate.getTime()) / (24 * 60 * 60 * 1000)));

  // 2. Delay Days Calculation
  let totalDelayDays = 0;
  (shipment.checkpoints || []).forEach(cp => {
    if (cp.actualDate && cp.plannedDate) {
      const diff = Math.ceil((new Date(cp.actualDate).getTime() - new Date(cp.plannedDate).getTime()) / (24 * 60 * 60 * 1000));
      if (diff > 0) totalDelayDays = Math.max(totalDelayDays, diff);
    } else if (!cp.actualDate && cp.plannedDate) {
      const overdue = Math.ceil((today.getTime() - new Date(cp.plannedDate).getTime()) / (24 * 60 * 60 * 1000));
      if (overdue > 0) totalDelayDays = Math.max(totalDelayDays, overdue);
    }
  });

  // 3. Estimated Arrival
  const checkpoints = shipment.checkpoints || [];
  const finalCheckpoint = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
  const originalArrival = new Date(finalCheckpoint?.plannedDate || shipment.departureDate);
  const estimatedArrivalDate = new Date(originalArrival.getTime() + totalDelayDays * 24 * 60 * 60 * 1000);

  return {
    currentTransitTime,
    delayDays: totalDelayDays,
    estimatedArrival: estimatedArrivalDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  };
};

const MODAL_CONFIGS: Record<TransportMode, { checkpoints: { label: string; duration: number | 'next_sunday' }[]; icon: any }> = {
  Road: {
    checkpoints: [
      { label: 'Saída MAO', duration: 2 },
      { label: 'MAO - BEL', duration: 6 },
      { label: 'Saída BEL', duration: 2 },
      { label: 'BEL - Cliente', duration: 6 }
    ],
    icon: Truck
  },
  Maritime: {
    checkpoints: [
      { label: 'Saída MAO', duration: 'next_sunday' },
      { label: 'MAO - SSZ', duration: 13 },
      { label: 'SSZ - Liberação Porto', duration: 3 },
      { label: 'Liberação - Cliente', duration: 1 }
    ],
    icon: Ship
  },
  Air: {
    checkpoints: [
      { label: 'Voo MAO - GRU', duration: 5 }
    ],
    icon: Plane
  },
  Express: {
    checkpoints: [
      { label: 'Voo MAO - GRU', duration: 2 }
    ],
    icon: Zap
  }
};

const INITIAL_SHIPMENTS: Shipment[] = [];

// --- Components ---

const Header = ({ activeTab, onTabChange, profile, permissions }: { activeTab: string; onTabChange: (tab: string) => void, profile?: Profile | null, permissions: ModuleAccess[] }) => (
  <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between h-16 items-center">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => onTabChange('home')}>
            <div className="bg-orange-600 p-1.5 rounded-lg group-hover:bg-orange-700 transition-colors shadow-lg shadow-orange-200">
              <Package className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-orange-600 transition-colors">CargoTrack</span>
          </div>
          <nav className="hidden md:flex space-x-8">
            {['Settings'].map((tab) => {
              if (tab === 'Settings' && profile?.role !== 'super-admin' && profile?.role !== 'company-admin') return null;
              
              return (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab.toLowerCase())}
                  className={`text-sm font-medium transition-colors relative py-5 ${activeTab === tab.toLowerCase() ? 'text-orange-600' : 'text-slate-500 hover:text-slate-900'
                    }`}
                >
                  {tab}
                  {activeTab === tab.toLowerCase() && (
                    <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex flex-col items-end mr-2">
            <span className="text-xs font-bold text-slate-900">{profile?.email.split('@')[0]}</span>
            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">{profile?.role}</span>
          </div>
          <button
            onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
            className="p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-full transition-all group"
            title="Sair"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border border-slate-300">
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.email || 'user'}`} alt="User" />
          </div>
        </div>
      </div>
    </div>
  </header>
);

const MainPanel = ({ onNavigate, profile, permissions, shipments }: { onNavigate: (view: any) => void, profile: Profile | null, permissions: ModuleAccess[], shipments: Shipment[] }) => {
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [docs, setDocs] = React.useState<Document[]>([]);

  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        let qPay = supabase.from('payments').select('*');
        let qDoc = supabase.from('documents').select('*');
        
        if (profile?.role !== 'super-admin' && profile?.company_id) {
           qPay = qPay.eq('company_id', profile.company_id);
           qDoc = qDoc.eq('company_id', profile.company_id);
        }

        const [resPay, resDoc] = await Promise.all([qPay, qDoc]);
        if (resPay.data) setPayments(resPay.data);
        if (resDoc.data) setDocs(resDoc.data);
      } catch (e) {
        console.error('Stats fetch error', e);
      }
    };
    if (profile) fetchStats();
  }, [profile]);

  // KPI Calculations
  const activeShipments = (shipments || []).filter(s => s.status === 'on-route' || s.status === 'pending').length;
  const delayedShipments = (shipments || []).filter(s => {
    try { return getTransitMetrics(s).delayDays > 0; } catch { return false; }
  });
  
  let totalFreight = 0;
  (shipments || []).forEach(s => {
    try {
      const numericStr = (s.value || '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
      const val = parseFloat(numericStr);
      if (!isNaN(val)) totalFreight += val;
    } catch (_) {}
  });
  const avgFreight = shipments?.length > 0 ? (totalFreight / shipments.length) : 0;

  const pendingPayments = payments.filter(p => p.status === 'pending');
  const pendingPaymentsValue = pendingPayments.reduce((acc, p) => acc + p.amount, 0);

  const today = new Date();
  const warningDate = new Date();
  warningDate.setDate(today.getDate() + 30);
  
  const expiredDocs = docs.filter(d => d.expiry_date && new Date(d.expiry_date) < today).length;
  const expiringDocs = docs.filter(d => d.expiry_date && new Date(d.expiry_date) >= today && new Date(d.expiry_date) <= warningDate).length;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 pb-24">
      <h1 className="text-2xl font-semibold mb-6 text-slate-800 tracking-tight">Visão Geral <span className="text-slate-400 text-sm ml-2 font-normal">Métricas consolidadas</span></h1>
      
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.015)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-shadow">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
            Embarques <Truck className="w-3 h-3" />
          </p>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold text-emerald-500">{activeShipments}</span>
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold mb-1">Ativos</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.015)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-shadow">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
            Atrasos <AlertTriangle className="w-3 h-3" />
          </p>
          <div className="flex items-end gap-3">
            <span className={`text-4xl font-bold ${delayedShipments.length > 0 ? 'text-red-500' : 'text-slate-800'}`}>{delayedShipments.length}</span>
            {delayedShipments.length > 0 && <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-semibold mb-1">Atenção</span>}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.015)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-shadow">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
            Faturamento Médio <BarChart3 className="w-3 h-3" />
          </p>
          <div className="flex items-end gap-3">
            <span className="text-2xl font-bold text-blue-500">
              R$ {avgFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">Por embarque realizado</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.015)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-shadow cursor-pointer group" onClick={() => onNavigate('payments')}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
            Faturas Pendentes <CreditCard className="w-3 h-3 group-hover:text-rose-500 transition-colors" />
          </p>
          <div className="flex items-end gap-3">
             <span className="text-2xl font-bold text-slate-800">
                R$ {pendingPaymentsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
             </span>
             {pendingPaymentsValue > 0 && <span className="text-xs text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full font-semibold mb-1">{pendingPayments.length} Abertos</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
         <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.015)] flex flex-col items-center justify-center min-h-[220px] relative overflow-hidden group cursor-pointer hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-shadow" onClick={() => onNavigate('dashboard')}>
            <div className="absolute inset-0 bg-gradient-to-br from-orange-50/50 to-transparent"></div>
            <Truck className="w-14 h-14 text-orange-100 mb-4 group-hover:scale-110 transition-transform duration-300" />
            <h3 className="font-bold text-slate-800 text-lg mb-1 relative z-10">Embarques em Rota</h3>
            <p className="text-slate-500 text-sm mb-4 text-center relative z-10">{activeShipments} embarques ativos agora.</p>
            <button className="bg-slate-900 text-white px-5 py-2 rounded-full text-sm font-bold shadow hover:bg-orange-600 transition-colors relative z-10">
               Ver Embarques
            </button>
         </div>

         <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.015)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-shadow">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center justify-between">
               Alerta de Documentos
               <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest cursor-pointer hover:bg-orange-50 hover:text-orange-600 transition-colors font-bold" onClick={() => onNavigate('docs')}>
                 VER TODOS
               </span>
            </h3>
            <div className="space-y-4">
               {expiredDocs > 0 && (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 flex items-center gap-4">
                     <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5" />
                     </div>
                     <div>
                        <p className="font-bold text-rose-900">{expiredDocs} documento(s) vencido(s)</p>
                        <p className="text-xs text-rose-600 mt-1 font-medium">Requer atenção imediata</p>
                     </div>
                  </div>
               )}
               {expiringDocs > 0 && (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-center gap-4">
                     <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                        <Clock className="w-5 h-5" />
                     </div>
                     <div>
                        <p className="font-bold text-amber-900">{expiringDocs} doc(s) vencendo em 30 dias</p>
                        <p className="text-xs text-amber-600 mt-1 font-medium">Agende renovação</p>
                     </div>
                  </div>
               )}
               {expiredDocs === 0 && expiringDocs === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                     <ShieldCheck className="w-12 h-12 mb-3 text-emerald-100" />
                     <p className="font-medium text-emerald-600">Documentação em dia</p>
                  </div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
};

const PamModule = ({ onBack, profile }: { onBack: () => void, profile: Profile | null }) => {
  const [chatMsg, setChatMsg] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', msg: 'Olá! Sou a Pam. Como posso analisar sua frota ou otimizar seus embarques hoje?' }
  ]);
  
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMsg.trim()) return;
    setChatHistory([...chatHistory, { role: 'user', msg: chatMsg }, { role: 'ai', msg: 'Perfeito! Analisei sua solicitação com base nos dados mais recentes. O que mais você gostaria de saber?' }]);
    setChatMsg('');
  };

  return (
    <div className="flex bg-white font-sans text-slate-800 h-[calc(100vh-64px)] w-full overflow-hidden">
      {/* Left Sidebar - History */}
      <div className="w-72 border-r border-slate-100 bg-[#fafafa] flex flex-col py-6 shrink-0 shadow-[2px_0_15px_rgba(0,0,0,0.02)] relative z-10">
        <div className="px-5 mb-8">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-semibold text-sm transition-colors cursor-pointer w-fit">
            <ArrowLeft className="w-5 h-5" /> Retornar ao Dashboard
          </button>
        </div>
        
        <div className="px-5 mb-8">
          <button className="flex items-center gap-3 bg-white w-full py-3 px-5 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] transition-all cursor-pointer font-bold text-sm border border-slate-100 text-slate-700 hover:text-orange-600 group active:scale-95">
            <Plus className="w-5 h-5 text-slate-400 group-hover:text-orange-500 transition-colors" /> Nova Solicitação
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-3 custom-scrollbar space-y-1 text-slate-600">
          <p className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Recentes</p>
          <button className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-slate-100/80 rounded-xl truncate cursor-pointer transition-colors flex items-center gap-3">
             <MessageSquare className="w-4 h-4 opacity-50 shrink-0" /> <span className="truncate">Custo médio da Rota SP-MAO</span>
          </button>
          <button className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-slate-100/80 rounded-xl truncate cursor-pointer transition-colors flex items-center gap-3">
             <MessageSquare className="w-4 h-4 opacity-50 shrink-0" /> <span className="truncate">Veículos demandando manutenção</span>
          </button>
          <button className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-slate-100/80 rounded-xl truncate cursor-pointer transition-colors flex items-center gap-3">
             <MessageSquare className="w-4 h-4 opacity-50 shrink-0" /> <span className="truncate">Resumo embarques atrasados</span>
          </button>
        </div>
      </div>

      {/* Main Chat Area - like Gemini */}
      <div className="flex-1 flex flex-col relative bg-white h-full">
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col custom-scrollbar">
           <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col space-y-6 pt-12 pb-32">
             {chatHistory.length === 1 && (
               <div className="flex flex-col items-center justify-center flex-1 space-y-6 opacity-90 h-full -mt-10">
                 <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-rose-500 rounded-[24px] flex items-center justify-center text-white shadow-xl shadow-orange-500/20 rotate-3 hover:rotate-6 transition-transform">
                   <Sparkles className="w-10 h-10" />
                 </div>
                 <h2 className="text-3xl font-semibold tracking-tight text-center text-slate-800">Sua assistente Pam</h2>
               </div>
             )}
             {chatHistory.map((c, i) => (
                <div key={i} className={`flex gap-4 w-full ${c.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {c.role === 'ai' && (
                    <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white shrink-0 shadow-sm mt-1">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  )}
                  <div className={`px-6 py-4 rounded-3xl max-w-[85%] text-[15px] leading-relaxed font-medium shadow-[0_2px_10px_rgba(0,0,0,0.02)] ${c.role === 'ai' ? 'text-slate-700 bg-white border border-slate-100 rounded-tl-none' : 'bg-slate-100 text-slate-800 rounded-tr-none'}`}>
                    {c.msg}
                  </div>
                  {c.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0 mt-1 overflow-hidden border border-slate-200">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.email || 'user'}`} alt="User" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
             ))}
           </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-20 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <form onSubmit={handleSendChat} className="relative shadow-[0_10px_40px_rgba(0,0,0,0.08)] rounded-[28px] bg-white border border-slate-200 group focus-within:ring-4 focus-within:ring-orange-500/10 focus-within:border-orange-200 transition-all">
               <input
                 value={chatMsg}
                 onChange={e => setChatMsg(e.target.value)}
                 placeholder="Faça uma pergunta ou solicite uma análise para a Pam..."
                 className="w-full py-5 pl-8 pr-16 outline-none rounded-[28px] text-[15px] font-medium text-slate-700 placeholder:text-slate-400 bg-transparent"
               />
               <button disabled={!chatMsg.trim()} type="submit" className="absolute right-3 top-3 bottom-3 w-12 shrink-0 rounded-[20px] bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 disabled:opacity-50 transition-all shadow-sm active:scale-95 cursor-pointer">
                 <Send className="w-5 h-5 ml-1" />
               </button>
            </form>
            <p className="text-center text-[10px] text-slate-400 mt-4 font-semibold tracking-wide uppercase">A Pam pode apresentar informações incorretas. Verifique fatos importantes.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const FreightCalc = ({ onBack }: { onBack: () => void }) => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">FreightCalc Simulator</h1>
          <p className="text-sm text-slate-500">Comparative quotation and performance engine</p>
        </div>
      </div>
      <button className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100">+ New Simulation</button>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-6">Recent Quotations</h3>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-blue-200 transition-all cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm"><Calculator className="w-5 h-5 text-blue-600" /></div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Route MAO-SP · 12.5 tons</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Simulated 2h ago</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-600">R$ 4.250,00</p>
                  <p className="text-[10px] text-emerald-600 font-bold uppercase">Best Value</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden">
          <div className="relative z-10">
            <BarChart3 className="w-8 h-8 text-blue-400 mb-4" />
            <h3 className="font-bold text-lg mb-2">Carrier Performance</h3>
            <p className="text-slate-400 text-xs leading-relaxed">Ranking based on lead-time adherence and historical cost adherence.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const CargoFit = ({ onBack }: { onBack: () => void }) => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CargoFit 3D</h1>
          <p className="text-sm text-slate-500">Trailer occupation & load optimization</p>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Material Library</h3>
        <div className="space-y-3">
          {['Box A-101', 'Pallet Std', 'Crate XL'].map(m => (
            <div key={m} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-700 flex justify-between items-center">
              <span>{m}</span>
              <span className="text-slate-400">120x80x100</span>
            </div>
          ))}
        </div>
      </div>
      <div className="md:col-span-3 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-20 text-center">
        <div className="w-full max-w-md bg-white h-32 rounded-xl flex items-center justify-center border border-slate-200 shadow-sm relative overflow-hidden mb-8">
          <div className="absolute inset-0 opacity-5 bg-[linear-gradient(45deg,#000_25%,transparent_25%,transparent_50%,#000_50%,#000_75%,transparent_75%,transparent)] bg-[length:20px_20px]" />
          <p className="text-slate-300 font-bold uppercase tracking-tighter text-4xl italic">3D SIMULATOR</p>
        </div>
        <p className="text-slate-500 font-medium">Select materials to begin occupation simulation.</p>
        <div className="mt-8 flex gap-4">
          <div className="px-4 py-2 bg-white rounded-full border border-slate-200 text-xs font-bold text-slate-600 shadow-sm">Occupancy: 0%</div>
          <div className="px-4 py-2 bg-white rounded-full border border-slate-200 text-xs font-bold text-slate-600 shadow-sm">Center of Gravity: --</div>
        </div>
      </div>
    </div>
  </div>
);

const ForkManager = ({ onBack }: { onBack: () => void }) => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ForkManager</h1>
          <p className="text-sm text-slate-500">Fleet maintenance & asset control</p>
        </div>
      </div>
      <button className="px-6 py-2 bg-orange-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-orange-100">Open Work Order</button>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="lg:col-span-3 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { id: 'FL-001', model: 'Toyota 8FG', hours: '1.240h', status: 'Maintenance' },
            { id: 'FL-002', model: 'Hyster H50', hours: '890h', status: 'Active' },
            { id: 'FL-003', model: 'Linde E20', hours: '3.120h', status: 'Critical' }
          ].map(f => (
            <div key={f.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group">
              <div className="flex justify-between items-start mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${f.status === 'Active' ? 'bg-emerald-50 text-emerald-600' :
                  f.status === 'Critical' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                  }`}>
                  <Zap className="w-5 h-5" />
                </div>
                <span className={`text-[9px] font-bold uppercase py-1 px-2 rounded-full ${f.status === 'Active' ? 'bg-emerald-50 text-emerald-600' :
                  f.status === 'Critical' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                  }`}>{f.status}</span>
              </div>
              <h3 className="font-bold text-slate-900">{f.id}</h3>
              <p className="text-xs text-slate-500 mb-4">{f.model}</p>
              <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                <span className="text-xs text-slate-400 font-medium">Hours: {f.hours}</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-orange-600 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Preventive Alerts</h3>
        <div className="space-y-4">
          <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl">
            <p className="text-xs font-bold text-orange-900">FL-001: Next Service in 12h</p>
            <p className="text-[10px] text-orange-700 mt-1">Plan: Engine Oil & Filters</p>
          </div>
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl animate-pulse">
            <p className="text-xs font-bold text-red-900">FL-003: OVERDUE</p>
            <p className="text-[10px] text-red-700 mt-1">Hydraulic system inspection required.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const DailySchedulePanel = ({ onBack, profile }: { onBack: () => void; profile: Profile | null }) => {
  type CardType = {
    id: string;
    column_id: string;
    carrier: string;
    client: string;
    volumetry: string;
    labeled: boolean;
    in_yard: boolean;
    separated: boolean;
    loaded: boolean;
    released: boolean;
    notes: string;
    position: number;
    _local?: boolean;
  };
  type ColType = { id: string; title: string; day_index: number; week_key: string; position: number; cards: CardType[]; _local?: boolean };

  const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const buildWeek = (weekOffset: number) => {
    const today = new Date();
    // Get Monday of current week (handle Sunday=0 edge case)
    const dow = today.getDay() === 0 ? 7 : today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - dow + 1 + weekOffset * 7);

    // Build week key
    const yr = monday.getFullYear();
    const startOfYear = new Date(yr, 0, 1);
    const wn = Math.ceil(((monday.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    const weekKey = `${yr}-W${wn.toString().padStart(2, '0')}`;

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dd = d.getDate().toString().padStart(2, '0');
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const name = DAY_NAMES[d.getDay()];
      const isToday = d.toDateString() === today.toDateString();
      return { label: isToday ? `Hoje · ${name}` : `${name} ${dd}/${mm}`, date: d, isToday };
    });

    const fmt = (d: Date) => `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const label = weekOffset === 0 ? '📅 Esta semana' : `${fmt(monday)} – ${fmt(sunday)}`;

    return { weekKey, days, label };
  };

  const companyId = profile?.company_id || null;
  const [weekOffset, setWeekOffset] = useState(0);
  const [columns, setColumns] = useState<ColType[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [draggedCard, setDraggedCard] = useState<{ colId: string; cardId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { weekKey, days, label: weekLabel } = buildWeek(weekOffset);

  // Build local skeleton columns for the week immediately (no DB needed to render)
  const buildLocalColumns = (wKey: string, dayList: typeof days): ColType[] =>
    dayList.map((d, i) => ({
      id: `local-${wKey}-${i}`,
      title: d.label,
      day_index: i,
      week_key: wKey,
      position: i,
      cards: [],
      _local: true,
    }));

  const loadWeek = async (wKey: string, dayList: typeof days) => {
    // 1. Immediately show local skeleton so board is never blank
    setColumns(buildLocalColumns(wKey, dayList));
    setError(null);
    setSyncing(true);
    setEditingCardId(null);

    try {
      // 2. Try to upsert 7 columns for this week into DB
      const toUpsert = dayList.map((d, i) => ({
        title: d.label,
        position: i,
        day_index: i,
        week_key: wKey,
        company_id: companyId,
      }));

      const { data: upsertedCols, error: upsertErr } = await supabase
        .from('daily_schedule_columns')
        .upsert(toUpsert, { onConflict: 'week_key,day_index,company_id' })
        .select();

      // If upsert fails, try plain insert then select
      let cols: any[] = upsertedCols || [];
      if (upsertErr || cols.length === 0) {
        // Try fetching existing
        const { data: existing } = await supabase
          .from('daily_schedule_columns')
          .select('*')
          .eq('week_key', wKey)
          .order('position');
        
        if (existing && existing.length > 0) {
          cols = existing;
        } else {
          // plain insert one by one
          cols = [];
          for (const row of toUpsert) {
            const { data: ins } = await supabase.from('daily_schedule_columns').insert([row]).select().single();
            if (ins) cols.push(ins);
          }
        }
      }

      if (cols.length === 0) {
        // Stay with local skeleton, show soft warning
        setError('Modo offline — alterações não serão salvas no banco.');
        setSyncing(false);
        return;
      }

      // 3. Load cards for these columns
      const colIds = cols.map((c: any) => c.id);
      const { data: cards } = await supabase
        .from('daily_schedule_cards')
        .select('*')
        .in('column_id', colIds)
        .order('position');

      const mapped: ColType[] = cols
        .sort((a: any, b: any) => a.position - b.position)
        .map((c: any) => ({
          ...c,
          cards: (cards || []).filter((ca: any) => ca.column_id === c.id),
        }));

      setColumns(mapped);
    } catch (e: any) {
      setError('Erro ao conectar com o banco. Trabalhando offline.');
      console.error('loadWeek error:', e);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { loadWeek(weekKey, days); }, [weekOffset]);

  const addCard = async (col: ColType) => {
    const newLocal: CardType = {
      id: `local-card-${Date.now()}`,
      column_id: col.id,
      carrier: '', client: '', volumetry: '',
      labeled: false, in_yard: false, separated: false, loaded: false, released: false,
      notes: '', position: col.cards.length, _local: true,
    };
    setColumns(prev => prev.map(c => c.id === col.id ? { ...c, cards: [...c.cards, newLocal] } : c));
    setEditingCardId(newLocal.id);

    if (!col._local) {
      const { data, error } = await supabase.from('daily_schedule_cards').insert([{
        column_id: col.id, company_id: companyId,
        carrier: '', client: '', volumetry: '',
        labeled: false, in_yard: false, separated: false, loaded: false, released: false,
        notes: '', position: col.cards.length
      }]).select().single();
      if (!error && data) {
        setEditingCardId(data.id);
        setColumns(prev => prev.map(c => c.id === col.id ? {
          ...c,
          cards: c.cards.map(ca => ca.id === newLocal.id ? data : ca)
        } : c));
      }
    }
  };

  const updateCard = async (cardId: string, field: string, value: any) => {
    setColumns(prev => prev.map(c => ({
      ...c, cards: c.cards.map(ca => ca.id === cardId ? { ...ca, [field]: value } : ca)
    })));
    const card = columns.flatMap(c => c.cards).find(ca => ca.id === cardId);
    if (card?._local) return;
    setSaving(cardId);
    await supabase.from('daily_schedule_cards').update({ [field]: value }).eq('id', cardId);
    setSaving(null);
  };

  const deleteCard = async (cardId: string, colId: string) => {
    const card = columns.flatMap(c => c.cards).find(ca => ca.id === cardId);
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, cards: c.cards.filter(ca => ca.id !== cardId) } : c));
    if (editingCardId === cardId) setEditingCardId(null);
    if (!card?._local) await supabase.from('daily_schedule_cards').delete().eq('id', cardId);
  };

  const handleDragStart = (e: React.DragEvent, colId: string, cardId: string) => {
    setDraggedCard({ colId, cardId });
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = async (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    if (!draggedCard || draggedCard.colId === targetColId) { setDraggedCard(null); return; }
    const srcCol = columns.find(c => c.id === draggedCard.colId);
    const card = srcCol?.cards.find(ca => ca.id === draggedCard.cardId);
    if (!card) { setDraggedCard(null); return; }
    setColumns(prev => prev.map(c => {
      if (c.id === draggedCard.colId) return { ...c, cards: c.cards.filter(ca => ca.id !== draggedCard.cardId) };
      if (c.id === targetColId) return { ...c, cards: [...c.cards, { ...card, column_id: targetColId }] };
      return c;
    }));
    if (!card._local) await supabase.from('daily_schedule_cards').update({ column_id: targetColId }).eq('id', draggedCard.cardId);
    setDraggedCard(null);
  };

  const BoolBtn = ({ label, value, cardId, field }: { label: string; value: boolean; cardId: string; field: string }) => (
    <button
      onClick={() => updateCard(cardId, field, !value)}
      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all border ${value ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
    >
      {value ? <CheckCircle2 className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
      {label}
    </button>
  );

  return (
    <div className="px-4 py-4 h-[calc(100vh-64px)] flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">Programação Diária</h1>
              {syncing && <span className="text-[10px] text-blue-500 animate-pulse font-medium">● sincronizando...</span>}
            </div>
            <p className="text-[11px] text-slate-400">Arraste para mover · Clique <Pencil className="w-2.5 h-2.5 inline" /> para editar · Salvo no banco automaticamente</p>
          </div>
        </div>
        {/* Week navigator */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <button onClick={() => setWeekOffset(0)} className="text-xs font-bold text-slate-700 hover:text-blue-600 px-2 transition-colors min-w-[120px] text-center">
            {weekLabel}
          </button>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 shrink-0 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 font-medium">{error}</p>
          <button onClick={() => loadWeek(weekKey, days)} className="ml-auto text-xs font-bold text-amber-600 hover:text-amber-800">Tentar novamente</button>
        </div>
      )}

      {/* Kanban board */}
      <div className="flex gap-3 overflow-x-auto flex-1 min-h-0 pb-2" style={{ alignItems: 'flex-start' }}>
        {columns.map(col => {
          const isDragTarget = draggedCard && draggedCard.colId !== col.id;
          const today = new Date().toDateString();
          const isToday = days[col.position]?.date.toDateString() === today;

          return (
            <div
              key={col.id}
              className={`w-[195px] shrink-0 flex flex-col rounded-xl border transition-all duration-150 ${
                isDragTarget ? 'border-blue-400 border-dashed bg-blue-50/60 scale-[1.01]' :
                isToday ? 'border-blue-300 bg-white shadow-md' :
                'border-slate-200 bg-white shadow-sm'
              }`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              {/* Column header */}
              <div className={`px-3 py-2 rounded-t-xl border-b flex items-center justify-between ${isToday ? 'bg-blue-600 border-blue-600' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-[11px] font-extrabold truncate leading-tight ${isToday ? 'text-white' : 'text-slate-700'}`}>{col.title}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${isToday ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-500'}`}>{col.cards.length}</span>
                </div>
                <button
                  onClick={() => addCard(col)}
                  className={`shrink-0 w-5 h-5 flex items-center justify-center rounded-md transition-colors ${isToday ? 'text-white/80 hover:bg-white/20 hover:text-white' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'}`}
                  title="Adicionar carregamento"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Card list */}
              <div className="p-2 flex flex-col gap-1.5">
                {col.cards.map(card => (
                  <div
                    key={card.id}
                    draggable={editingCardId !== card.id}
                    onDragStart={(e) => editingCardId !== card.id && handleDragStart(e, col.id, card.id)}
                    className={`rounded-lg border-l-[3px] border transition-all relative group ${
                      card.released ? 'border-l-violet-500 border-violet-100 bg-violet-50/30' :
                      card.loaded ? 'border-l-emerald-500 border-emerald-100 bg-emerald-50/30' :
                      card.separated ? 'border-l-blue-400 border-blue-100 bg-blue-50/20' :
                      'border-l-slate-300 border-slate-100 bg-white'
                    } ${editingCardId !== card.id ? 'cursor-grab active:cursor-grabbing hover:shadow-sm' : 'cursor-default'}`}
                  >
                    {editingCardId === card.id ? (
                      <div className="p-2 flex flex-col gap-1.5">
                        <input autoFocus
                          className="w-full text-[11px] font-bold text-blue-900 border border-blue-200 rounded-md px-2 py-1 outline-none bg-blue-50 focus:ring-1 focus:ring-blue-400 placeholder:font-normal placeholder:text-slate-300"
                          placeholder="Transportador"
                          value={card.carrier}
                          onChange={e => updateCard(card.id, 'carrier', e.target.value)}
                        />
                        <input
                          className="w-full text-[11px] text-slate-700 border border-slate-200 rounded-md px-2 py-1 outline-none bg-slate-50 placeholder:text-slate-300"
                          placeholder="Cliente"
                          value={card.client}
                          onChange={e => updateCard(card.id, 'client', e.target.value)}
                        />
                        <input
                          className="w-full text-[11px] text-slate-500 border border-slate-200 rounded-md px-2 py-1 outline-none bg-slate-50 placeholder:text-slate-300"
                          placeholder="Volumetria (ex: 28 m³)"
                          value={card.volumetry}
                          onChange={e => updateCard(card.id, 'volumetry', e.target.value)}
                        />
                        <div className="flex flex-wrap gap-1">
                          <BoolBtn label="Etiq." value={card.labeled} cardId={card.id} field="labeled" />
                          <BoolBtn label="Pátio" value={card.in_yard} cardId={card.id} field="in_yard" />
                          <BoolBtn label="Sep." value={card.separated} cardId={card.id} field="separated" />
                          <BoolBtn label="Carr." value={card.loaded} cardId={card.id} field="loaded" />
                          <BoolBtn label="Lib." value={card.released} cardId={card.id} field="released" />
                        </div>
                        <input
                          className="w-full text-[10px] text-slate-400 border border-slate-100 rounded-md px-2 py-1 outline-none placeholder:text-slate-200"
                          placeholder="Observações..."
                          value={card.notes || ''}
                          onChange={e => updateCard(card.id, 'notes', e.target.value)}
                        />
                        <div className="flex items-center justify-between pt-0.5">
                          <button onClick={() => deleteCard(card.id, col.id)} className="text-[10px] text-red-400 hover:text-red-600 font-bold flex items-center gap-0.5">
                            <Trash2 className="w-2.5 h-2.5" /> excluir
                          </button>
                          <button onClick={() => setEditingCardId(null)} className="text-[10px] font-bold text-blue-600 flex items-center gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" /> ok
                          </button>
                        </div>
                        {saving === card.id && <p className="text-[9px] text-slate-300 animate-pulse">salvando...</p>}
                      </div>
                    ) : (
                      <div className="px-2.5 pt-1.5 pb-2">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-[11px] font-bold text-slate-800 leading-tight truncate flex-1">
                            {card.carrier || <span className="text-slate-300 font-normal italic">Transportador</span>}
                          </p>
                          <button
                            onClick={() => setEditingCardId(card.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-300 hover:text-blue-500 shrink-0"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        {card.client && <p className="text-[10px] text-slate-400 truncate">{card.client}</p>}
                        {card.volumetry && <p className="text-[10px] font-bold text-blue-500 mt-0.5">{card.volumetry}</p>}
                        <div className="flex flex-wrap gap-0.5 mt-1.5">
                          {[
                            { l: 'Etiq', v: card.labeled },
                            { l: 'Pátio', v: card.in_yard },
                            { l: 'Sep', v: card.separated },
                            { l: 'Carr', v: card.loaded },
                            { l: 'Lib', v: card.released },
                          ].map(({ l, v }) => (
                            <span key={l} className={`text-[8px] font-bold px-1 py-0.5 rounded ${v ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-300'}`}>{l}</span>
                          ))}
                        </div>
                        {card.notes && <p className="text-[9px] text-slate-400 italic mt-1 truncate">{card.notes}</p>}
                      </div>
                    )}
                  </div>
                ))}

                <button
                  onClick={() => addCard(col)}
                  className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-[10px] text-slate-300 hover:text-blue-500 transition-all"
                >
                  <Plus className="w-3 h-3" /> adicionar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Dashboard = ({ shipments, onSelectShipment, onCreateNew, onBack }: {
  shipments: Shipment[];
  onSelectShipment: (s: Shipment) => void;
  onCreateNew: () => void;
  onBack: () => void;
}) => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={onBack} className="text-xs font-bold text-blue-600 hover:underline">← App Selector</button>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Active Shipments</h1>
        <p className="text-sm text-slate-500 mt-1">Monitoring {shipments.length} routes.</p>
      </div>
      <div className="flex w-full sm:w-auto gap-3">
        <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
          <Filter className="w-4 h-4" />
          Filter
        </button>
        <button
          onClick={onCreateNew}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Shipment
        </button>
      </div>
    </div>

    <div className="space-y-4">
      {shipments.map((shipment) => {
        const ModeIcon = MODAL_CONFIGS[shipment.mode].icon;
        const metrics = getTransitMetrics(shipment);
        const progress = (metrics.currentTransitTime / shipment.leadTime) * 100;

        return (
          <motion.div
            key={shipment.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onSelectShipment(shipment)}
            className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-3">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Tracking</span>
                  {shipment.status === 'completed' && (
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded uppercase border border-indigo-100 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Entregue
                    </span>
                  )}
                  {shipment.status !== 'completed' && metrics.delayDays > 0 && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded uppercase border border-red-100 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> +{metrics.delayDays}d Delayed
                    </span>
                  )}
                  {shipment.status !== 'completed' && metrics.delayDays === 0 && (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded uppercase border border-emerald-100">On Route</span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-blue-600 group-hover:underline">
                  {shipment.trackingTag || 'No Tag'} {shipment.departureDate}
                </h3>
                <div className="flex items-center gap-2 mt-2 text-slate-500 text-sm">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{shipment.origin} → {shipment.destination}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-slate-400 text-xs">
                  <ModeIcon className="w-3.5 h-3.5" />
                  <span>{shipment.carrier}</span>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="relative flex justify-between items-center mb-6 pt-4">
                  {/* Progress Line Background */}
                  <div className="absolute left-[20px] right-[20px] h-1 bg-slate-100 top-1/2 -translate-y-1/2 -z-10 rounded-full" />

                  {(shipment.checkpoints || []).map((cp, idx) => {
                    const isOverdue = isCheckpointDelayed(cp);
                    return (
                      <div key={cp.id} className="flex flex-col items-center gap-2 relative">
                        <div className={`w-3 h-3 lg:w-4 lg:h-4 rounded-full border-2 lg:border-3 border-white shadow-md transition-all ${cp.status === 'completed' ? 'bg-emerald-500' :
                          isOverdue ? 'bg-red-500 animate-pulse ring-4 ring-red-100' :
                            cp.status === 'current' ? 'bg-blue-600 ring-2 ring-blue-100' : 'bg-slate-200'
                          }`} />
                        <span className={`text-[8px] lg:text-[10px] font-bold uppercase tracking-tighter absolute -bottom-6 whitespace-nowrap hidden lg:block ${isOverdue ? 'text-red-600 font-extrabold' :
                          cp.status === 'pending' ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                          {cp.label}
                          <span className="block text-[7px] font-normal opacity-70 mt-0.5">
                            {cp.actualDate ? new Date(cp.actualDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) :
                              cp.plannedDate ? new Date(cp.plannedDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-3 flex justify-between items-center lg:justify-end lg:gap-8">
                <div className="text-right">
                  <span className="text-xs text-slate-400 block uppercase font-bold tracking-tight">Transit Time</span>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-xl font-bold ${metrics.delayDays > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {metrics.currentTransitTime.toString().padStart(2, '0')}/{shipment.leadTime} dias
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">ETA: {metrics.estimatedArrival}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>

    <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6">
      {[
        { label: 'Total Managed', value: shipments.length.toString(), color: 'text-slate-900' },
        { label: 'In Transit', value: shipments.filter(s => s.status === 'on-route' || s.status === 'pending').length.toString(), color: 'text-blue-600' },
        { label: 'Delays', value: shipments.filter(s => getTransitMetrics(s).delayDays > 0).length.toString().padStart(2, '0'), color: 'text-amber-600' },
        { label: 'Completed Today', value: shipments.filter(s => s.status === 'completed').length.toString(), color: 'text-emerald-600' },
      ].map((stat) => (
        <div key={stat.label} className="bg-white p-6 rounded-xl border border-slate-200">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{stat.label}</span>
          <span className={`text-3xl font-bold ${stat.color}`}>{stat.value}</span>
        </div>
      ))}
    </div>
  </div>
);

const CarrierManagerModal = ({ onClose, profile, onCarriersChange }: {
  onClose: () => void;
  profile: Profile | null;
  onCarriersChange: (list: string[]) => void;
}) => {
  const [carriers, setCarriers] = React.useState<{ id: string; name: string; is_global: boolean; company_id?: string }[]>([]);
  const [newName, setNewName] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const canManage = profile?.role === 'super-admin' || profile?.role === 'company-admin';

  const fetchCarriersModal = async () => {
    setLoading(true);
    try {
      let q = supabase.from('carriers').select('*').order('name');
      if (profile?.role !== 'super-admin' && profile?.company_id) {
        q = (q as any).or(`company_id.eq.${profile.company_id},is_global.eq.true`);
      }
      const { data } = await q;
      const list = data || [];
      setCarriers(list);
      onCarriersChange(list.map((c: any) => c.name));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  React.useEffect(() => { fetchCarriersModal(); }, []);

  const handleAdd = async () => {
    if (!newName.trim() || !canManage) return;
    try {
      await supabase.from('carriers').insert([{
        name: newName.trim(),
        company_id: profile?.role === 'super-admin' ? null : profile?.company_id,
        is_global: profile?.role === 'super-admin'
      }]);
      setNewName('');
      fetchCarriersModal();
    } catch (e) { alert('Erro ao adicionar transportadora'); }
  };

  const handleDeleteCarrier = async (id: string) => {
    if (!canManage || !confirm('Confirmar exclusão?')) return;
    await supabase.from('carriers').delete().eq('id', id);
    fetchCarriersModal();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Truck className="w-4 h-4 text-orange-500" /> Gerenciar Transportadoras</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 text-xl font-bold">×</button>
        </div>
        <div className="p-5">
          {canManage && (
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Nome da transportadora..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button onClick={handleAdd} className="px-4 py-2 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {loading ? (
              <p className="text-slate-400 text-sm text-center py-4">Carregando...</p>
            ) : carriers.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">Nenhuma transportadora cadastrada</p>
            ) : carriers.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                  {c.is_global && <span className="text-[10px] text-orange-500 font-bold uppercase">Global</span>}
                </div>
                {canManage && (profile?.role === 'super-admin' || !c.is_global) && (
                  <button onClick={() => handleDeleteCarrier(c.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const CreateShipment = ({ onCancel, onSave, profile }: { onCancel: () => void; onSave: (s: Shipment) => void; profile?: Profile | null }) => {
  const [mode, setMode] = useState<TransportMode>('Road');
  const [origin, setOrigin] = useState('Manaus (MAO)');
  const [destination, setDestination] = useState('Extrema (MG)');
  const [departureDate, setDepartureDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [carrier, setCarrier] = useState('');
  const [cargoType, setCargoType] = useState<'Lotação' | 'Fracionado'>('Lotação');
  const [cargoDescription, setCargoDescription] = useState('');
  const [value, setValue] = useState('');
  const [plate, setPlate] = useState('');
  const [seals, setSeals] = useState('');
  const [booking, setBooking] = useState('');
  const [trackingTag, setTrackingTag] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [shipName, setShipName] = useState('');
  const [sszArrivalDate, setSszArrivalDate] = useState('');
  const [showCarrierModal, setShowCarrierModal] = useState(false);
  const [carriersList, setCarriersList] = useState<string[]>(['LLS ESSENCIAL TRANSPORTES','MVM TRANSPORTES','TRAGETTA - FL BRASIL','BERTOLINE TRANSPORTES LTDA','MERCOSUL LINE']);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setInvoiceFile(e.target.files[0]);
    }
  };

  // fetch carriers from DB on mount
  React.useEffect(() => {
    const fetchCarriersDB = async () => {
      try {
        const { data } = await supabase.from('carriers').select('name').order('name');
        if (data && data.length > 0) {
          setCarriersList(data.map((c: any) => c.name));
        }
      } catch (e) { /* keep fallback */ }
    };
    fetchCarriersDB();
  }, []);

  const handleSave = async () => {
    const config = MODAL_CONFIGS[mode];

    // Calculate planned dates and lead time
    let currentPlannedDate = new Date(departureDate);
    let totalLeadTime = 0;

    const checkpointsWithDates = config.checkpoints.map((cp, idx) => {
      let durationDays = 0;
      if (cp.duration === 'next_sunday') {
        const day = currentPlannedDate.getDay();
        durationDays = (day === 0) ? 0 : (7 - day); // Sunday is 0
      } else {
        durationDays = cp.duration;
      }

      currentPlannedDate = new Date(currentPlannedDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
      totalLeadTime += durationDays;

      return {
        id: `c${idx}`,
        label: cp.label,
        status: (idx === 0 ? 'current' : 'pending') as 'pending' | 'completed' | 'current',
        plannedDate: currentPlannedDate.toISOString().split('T')[0],
        duration: durationDays
      };
    });

    setUploading(true);
    let invoiceFileUrl = '';
    let invoiceFileName = '';

    try {
      if (invoiceFile) {
        invoiceFileName = invoiceFile.name;
        const fileExt = invoiceFileName.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `invoices/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(filePath, invoiceFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('invoices')
          .getPublicUrl(filePath);

        invoiceFileUrl = urlData.publicUrl;
      }

      const newShipment: Shipment = {
        id: Math.random().toString(36).substr(2, 9),
        code: `OKA-2026-${Date.now().toString().slice(-6)}`,
        mode,
        origin,
        destination,
        status: 'pending',
        leadTime: totalLeadTime,
        currentTransitTime: 0,
        departureDate,
        carrier,
        cargoType,
        cargoDescription: cargoDescription || 'New Shipment',
        value: value || 'R$ 0,00',
        plate,
        seals,
        booking,
        trackingTag,
        shipName: mode === 'Maritime' ? shipName : undefined,
        sszArrivalDate: mode === 'Maritime' ? sszArrivalDate : undefined,
        invoices: [], // Empty since we are using files now
        invoiceFileUrl,
        invoiceFileName,
        checkpoints: checkpointsWithDates
      };
      onSave(newShipment);
    } catch (err) {
      console.error('Error uploading file or saving shipment:', err);
      alert('Error saving shipment. Check console for details.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <nav className="text-xs text-slate-400 uppercase font-bold tracking-widest flex items-center gap-2 mb-1">
            <span>Logistics</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-blue-600">Create Shipment</span>
          </nav>
          <h1 className="text-3xl font-bold text-slate-900">New Multimodal Shipment</h1>
          <p className="text-slate-500">{origin} → {destination}</p>
        </div>
        <button onClick={onCancel} className="ml-auto px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
          Discard
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Step Indicator */}
          <div className="flex items-center justify-between px-4">
            {[
              { step: '01', label: 'Transport Modal', active: true },
              { step: '02', label: 'Cargo Details', active: false },
              { step: '03', label: 'Review', active: false },
            ].map((s, i) => (
              <React.Fragment key={s.step}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${s.active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {s.step}
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${s.active ? 'text-slate-900' : 'text-slate-400'}`}>{s.label}</span>
                </div>
                {i < 2 && <div className="flex-1 h-px bg-slate-200 mx-4" />}
              </React.Fragment>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-6">2. Cargo & Shipping Details</h2>

            <div className="space-y-6">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">Route & Modal Selection</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['Road', 'Maritime', 'Air', 'Express'] as TransportMode[]).map((m) => {
                    const Icon = MODAL_CONFIGS[m].icon;
                    return (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${mode === m
                          ? 'border-blue-600 bg-blue-50 text-blue-600'
                          : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                          }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-bold text-sm">{m}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Origin</label>
                  <select
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option>Manaus (MAO)</option>
                    <option>Belém (BEL)</option>
                    <option>Santos (SSZ)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Destination</label>
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option>Extrema (MG)</option>
                    <option>Guarulhos (GRU)</option>
                    <option>Curitiba (CWB)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carrier Service</label>
                    <button type="button" onClick={() => setShowCarrierModal(true)} className="text-[10px] font-bold text-blue-500 hover:text-blue-700 flex items-center gap-1 uppercase">
                      <Settings className="w-3 h-3" /> Gerenciar
                    </button>
                  </div>
                  <select
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select Carrier...</option>
                    {carriersList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Cargo Type</label>
                  <div className="flex gap-3">
                    {['Lotação', 'Fracionado'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setCargoType(t as any)}
                        className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all ${cargoType === t
                          ? 'border-blue-600 bg-blue-50 text-blue-600'
                          : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                          }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Trailer Plate</label>
                  <input
                    type="text"
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    placeholder="ABC-1234"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Seals</label>
                  <input
                    type="text"
                    value={seals}
                    onChange={(e) => setSeals(e.target.value)}
                    placeholder="001, 002..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Booking</label>
                  <input
                    type="text"
                    value={booking}
                    onChange={(e) => setBooking(e.target.value)}
                    placeholder="BK-9876"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Tracking Tag</label>
                  <input
                    type="text"
                    value={trackingTag}
                    onChange={(e) => setTrackingTag(e.target.value)}
                    placeholder="TAG-5544"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Cargo Description</label>
                  <input
                    type="text"
                    value={cargoDescription}
                    onChange={(e) => setCargoDescription(e.target.value)}
                    placeholder="e.g. Electronics, Food..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Value (R$)</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="R$ 0,00"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-4">Invoice Documents (Excel/PDF)</label>
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-8 transition-all hover:bg-white hover:border-blue-400 group relative">
                  <input
                    type="file"
                    id="invoice-upload"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                    accept=".xlsx,.xls,.pdf,.csv"
                  />
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-900">{invoiceFile ? invoiceFile.name : 'Click or drag to upload'}</p>
                      <p className="text-xs text-slate-500 mt-1">{invoiceFile ? `${(invoiceFile.size / 1024).toFixed(1)} KB` : 'Excel or PDF supported (Max 10MB)'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Maritime-specific fields */}
              {mode === 'Maritime' && (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-4">
                  <div className="flex items-center gap-2">
                    <Ship className="w-4 h-4 text-blue-600" />
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-widest">Dados de Cabotagem</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Nome do Navio <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required={mode === 'Maritime'}
                        value={shipName}
                        onChange={(e) => setShipName(e.target.value)}
                        placeholder="Ex: MSC Amalfi"
                        className="w-full p-3 bg-white border border-blue-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Chegada SSZ - Santos <span className="text-red-500">*</span></label>
                      <input
                        type="date"
                        required={mode === 'Maritime'}
                        value={sszArrivalDate}
                        onChange={(e) => setSszArrivalDate(e.target.value)}
                        className="w-full p-3 bg-white border border-blue-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-[10px] text-blue-500 mt-1 font-medium">+3 dias para liberação de agendamento</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="col-span-full">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Departure Date</label>
                  <input
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm sticky top-24">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 uppercase text-xs tracking-widest">Shipment Summary</h2>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 text-center mb-6">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Projected Delivery</span>
              <span className="text-2xl font-bold text-slate-900 block">
                {(() => {
                  const config = MODAL_CONFIGS[mode];
                  let days = 0;
                  const date = new Date(departureDate);
                  config.checkpoints.forEach(cp => {
                    if (cp.duration === 'next_sunday') {
                      const d = date.getDay();
                      const diff = d === 0 ? 0 : 7 - d;
                      days += diff;
                      date.setDate(date.getDate() + diff);
                    } else {
                      days += cp.duration;
                      date.setDate(date.getDate() + cp.duration);
                    }
                  });
                  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
                })()}
              </span>
              <div className="mt-2 flex items-center justify-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase">On-schedule</span>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Transport Modal</span>
                <span className="font-bold text-blue-600 uppercase text-xs">{mode}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Base Freight</span>
                <span className="font-bold text-slate-900">R$ 3,850.00</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Est. Insurance</span>
                <span className="font-bold text-slate-900">R$ 400.00</span>
              </div>
              <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
                <span className="font-bold text-slate-900">Total Estimate</span>
                <span className="text-xl font-bold text-blue-600">R$ 4,250.00</span>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={uploading}
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {uploading ? 'Processing...' : 'Confirm Shipment'}
              {!uploading && <ChevronRight className="w-4 h-4" />}
            </button>
            <button className="w-full mt-4 text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors">
              Save for later
            </button>
          </div>

          {/* Removed Floating Card user requested */}
        </div>
      </div >
    </div >

      {showCarrierModal && (
        <CarrierManagerModal
          onClose={() => setShowCarrierModal(false)}
          profile={profile || null}
          onCarriersChange={(list) => setCarriersList(list)}
        />
      )}
    </>
  );
};

const ShipmentDetail = ({
  shipment,
  onBack,
  onUpdateStatus,
  onDeleteShipment
}: {
  shipment: Shipment;
  onBack: () => void;
  onUpdateStatus: () => void;
  onDeleteShipment: (id: string) => void;
}) => {
  const ModeIcon = MODAL_CONFIGS[shipment.mode].icon;
  const metrics = getTransitMetrics(shipment);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <nav className="text-xs text-slate-400 uppercase font-bold tracking-widest flex items-center gap-2 mb-1">
            <span className="hover:text-blue-600 cursor-pointer" onClick={onBack}>Shipments</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-blue-600">{shipment.trackingTag || shipment.code}</span>
          </nav>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-slate-900">{shipment.trackingTag || shipment.code}</h1>
            <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full border border-blue-100 uppercase tracking-wider">
              {shipment.mode}
            </span>
            {shipment.status === 'completed' && (
              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-full border border-indigo-100 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Entregue
              </span>
            )}
            {shipment.status === 'delayed' && (
              <span className="px-3 py-1 bg-amber-50 text-amber-600 text-xs font-bold rounded-full border border-amber-100 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Attention
              </span>
            )}
          </div>
          <div className="flex items-center gap-6 mt-2">
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Clock className="w-4 h-4" />
              <span>Total Transit Time: <span className="font-bold text-slate-900">{metrics.currentTransitTime}/{shipment.leadTime} days</span></span>
            </div>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <BarChart3 className="w-4 h-4" />
              <span>Estimated Arrival: <span className="font-bold text-slate-900">{metrics.estimatedArrival}</span></span>
            </div>
            {metrics.delayDays > 0 && (
              <span className="text-red-500 text-xs font-bold uppercase flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> +{metrics.delayDays} days delayed
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
          <button className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Download className="w-4 h-4" />
            Download All Docs
          </button>
          <button
            onClick={() => {
              if (window.confirm('Tem certeza que deseja apagar este embarque?')) {
                onDeleteShipment(shipment.id);
              }
            }}
            className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-medium hover:bg-red-100 shadow-sm transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Apagar
          </button>
          <button
            onClick={onUpdateStatus}
            className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
          >
            Update Status
          </button>
        </div>
      </div>

      {metrics.delayDays > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-4 animate-pulse">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-900 uppercase tracking-tight">Shipment Overdue (+{metrics.delayDays} days)</h3>
            <p className="text-xs text-red-600 font-medium mt-0.5">The shipment is currently delayed by {metrics.delayDays} days compared to the original plan. Please coordinate with the carrier.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Checkpoints Column */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-slate-900 uppercase text-xs tracking-widest">Checkpoints</h2>
              </div>
              <button className="text-slate-400 hover:text-slate-600"><MoreVertical className="w-5 h-5" /></button>
            </div>

            <div className="relative space-y-0">
              {/* Vertical Line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-100" />

              {shipment.checkpoints.map((cp, idx) => (
                <div key={cp.id} className="relative pl-12 pb-10 last:pb-0">
                  {/* Status Indicator */}
                  <div className={`absolute left-0 top-0 w-8 h-8 rounded-full border-4 border-white flex items-center justify-center z-10 ${cp.status === 'completed' ? 'bg-emerald-500' :
                    isCheckpointDelayed(cp) ? 'bg-red-500 animate-pulse ring-4 ring-red-100' :
                      cp.status === 'current' ? 'bg-blue-600 animate-pulse' : 'bg-slate-200'
                    }`}>
                    {cp.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    ) : isCheckpointDelayed(cp) ? (
                      <AlertTriangle className="w-4 h-4 text-white" />
                    ) : cp.status === 'current' ? (
                      <Clock className="w-4 h-4 text-white" />
                    ) : (
                      <Circle className="w-3 h-3 text-slate-400" />
                    )}
                  </div>

                  <div className={`p-4 rounded-xl border transition-all ${cp.status === 'current' ? 'bg-blue-50 border-blue-100' :
                    isCheckpointDelayed(cp) ? 'bg-red-50 border-red-100' :
                      cp.status === 'completed' ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-transparent'
                    }`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className={`font-bold text-sm ${cp.status === 'pending' ? 'text-slate-400' : 'text-slate-900'}`}>{cp.label}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{cp.location || 'In Transit'}</p>
                      </div>
                      {cp.actualDate || cp.plannedDate ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-100">
                            Est: {cp.plannedDate}
                          </span>
                          {cp.actualDate && (
                            <span className={`text-[10px] font-bold px-2 py-1 rounded border ${new Date(cp.actualDate) > new Date(cp.plannedDate || '')
                              ? 'bg-amber-50 border-amber-100 text-amber-600'
                              : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                              }`}>
                              Real: {cp.actualDate}
                            </span>
                          )}
                        </div>
                      ) : cp.timestamp && (
                        <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-100">{cp.timestamp}</span>
                      )}
                      {cp.status === 'current' && (
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">In Progress</span>
                      )}
                    </div>
                    {cp.details && (
                      <div className="mt-3 pt-3 border-t border-blue-100/50">
                        <p className="text-xs text-blue-600/70 italic">{cp.details}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Info Column */}
        <div className="lg:col-span-7 space-y-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-slate-900 uppercase text-xs tracking-widest">Documents & Invoices</h2>
              </div>
            </div>

            {shipment.invoiceFileUrl ? (
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between group hover:border-blue-200 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-lg shadow-sm border border-slate-100 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 truncate max-w-[200px]">{shipment.invoiceFileName || 'Invoice-Document.pdf'}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ready for download</p>
                  </div>
                </div>
                <a
                  href={shipment.invoiceFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-slate-400 italic">No document files attached to this shipment.</p>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Package className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 uppercase text-xs tracking-widest">Cargo Information</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Carrier</span>
                <span className="text-sm font-bold text-slate-900">{shipment.carrier || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Cargo Type</span>
                <span className="text-sm font-bold text-slate-900">{shipment.cargoType || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Description</span>
                <span className="text-sm font-bold text-slate-900">{shipment.cargoDescription || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Value</span>
                <span className="text-sm font-bold text-slate-900">{shipment.value || 'R$ 0,00'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Trailer Plate</span>
                <span className="text-sm font-bold text-slate-900">{shipment.plate || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Seals</span>
                <span className="text-sm font-bold text-slate-900">{shipment.seals || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Booking</span>
                <span className="text-sm font-bold text-slate-900">{shipment.booking || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Tracking Tag</span>
                <span className="text-sm font-bold text-slate-900">{shipment.trackingTag || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-8 text-white relative overflow-hidden h-64">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 text-blue-400" />
                <h2 className="font-bold uppercase text-xs tracking-widest">Real-time Position</h2>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 inline-block border border-white/20">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-ping" />
                  <span className="text-sm font-mono">Current Position: 23°56'S 46°17'W</span>
                </div>
              </div>
            </div>
            <img
              src="https://picsum.photos/seed/map/800/400?grayscale"
              alt="Map"
              className="absolute inset-0 w-full h-full object-cover opacity-30"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusUpdateModal = ({
  shipment,
  onClose,
  onUpdate
}: {
  shipment: Shipment;
  onClose: () => void;
  onUpdate: (updatedCheckpoints: Checkpoint[]) => void;
}) => {
  const [editingCheckpoints, setEditingCheckpoints] = useState<Checkpoint[]>([...shipment.checkpoints]);

  const handleDateChange = (id: string, date: string) => {
    const newCheckpoints = editingCheckpoints.map(cp => {
      if (cp.id === id) {
        return {
          ...cp,
          actualDate: date,
          status: (date ? 'completed' : (cp.status === 'completed' ? 'pending' : cp.status)) as any
        };
      }
      return cp;
    });

    // Recalculate subsequent planned dates based on the new actual date if it's the latest completion
    const updatedWithRecalc = newCheckpoints.map((cp, idx) => {
      if (idx > 0) {
        const prevCp = newCheckpoints[idx - 1];
        const baseDate = prevCp.actualDate || prevCp.plannedDate;
        if (baseDate) {
          const duration = cp.duration || 0;
          const newPlanned = new Date(new Date(baseDate).getTime() + duration * 24 * 60 * 60 * 1000);
          return { ...cp, plannedDate: newPlanned.toISOString().split('T')[0] };
        }
      }
      return cp;
    });

    setEditingCheckpoints(updatedWithRecalc);
  };

  const tempMetrics = getTransitMetrics({ ...shipment, checkpoints: editingCheckpoints });

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-900">Update Shipment Status</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">&times;</button>
        </div>
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {editingCheckpoints.map((cp) => (
            <div key={cp.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-slate-700">{cp.label}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Est: {cp.plannedDate}</span>
              </div>
              <input
                type="date"
                value={cp.actualDate || ''}
                onChange={(e) => handleDateChange(cp.id, e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New Est. Arrival</p>
              <p className="text-lg font-bold text-slate-900">{tempMetrics.estimatedArrival}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Calculated Impact</p>
              <p className={`text-sm font-bold ${tempMetrics.delayDays > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {tempMetrics.delayDays > 0 ? `+${tempMetrics.delayDays} days delay` : 'On schedule'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onUpdate(editingCheckpoints)}
              className="flex-2 px-4 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
            >
              Update Shipment
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const SettingsPanel = ({ onBack, currentUser }: { onBack: () => void, currentUser: Profile | null }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('user');
  const [newUserCompany, setNewUserCompany] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [carriersList, setCarriersList] = useState<any[]>([]);
  const [newCarrier, setNewCarrier] = useState('');


  const availableModules = [
    { id: 'dashboard', label: 'Shipments' },
    { id: 'freight-calc', label: 'FreightCalc' },
    { id: 'cargo-fit', label: 'CargoFit' },
    { id: 'fork-manager', label: 'ForkManager' },
    { id: 'payments', label: 'Payments' },
    { id: 'docs', label: 'Documents' }
  ];

  useEffect(() => {
    fetchUsers();
  }, [currentUser]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      let query = supabase.from('profiles').select('*, user_module_access(*), companies(name)');
      if (currentUser?.role === 'company-admin') {
        query = query.eq('company_id', currentUser.company_id);
      }
      const { data, error } = await query;
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user? This action is irreversible.')) return;
    try {
      // First delete related module access entries
      await supabase.from('user_module_access').delete().eq('user_id', userId);
      // Then delete the profile
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;

      alert('User deleted successfully.');
      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Error deleting user');
    }
  };

  const savePermissions = async (userId: string, modulePermissions: any[], role: UserRole) => {
    try {
      // Update user role
      await supabase.from('profiles').update({ role: role }).eq('id', userId);

      // Delete existing permissions
      await supabase.from('user_module_access').delete().eq('user_id', userId);

      // Insert new permissions
      if (modulePermissions.length > 0) {
        const toInsert = modulePermissions.map(mp => ({
          user_id: userId,
          module_id: mp.module_id,
          permission_type: mp.permission_type
        }));
        const { error: insertError } = await supabase.from('user_module_access').insert(toInsert);
        if (insertError) throw insertError;
      }
      alert('Permissions and role updated successfully!');
      fetchUsers();
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving permissions:', err);
      alert('Error saving permissions');
    }
  };

  const handleInviteNewUser = async () => {
    if (!newUserEmail) {
      alert('Please enter an email for the new collaborator.');
      return;
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', newUserEmail)
      .single();

    if (existingUser) {
      alert('This email is already in use.');
      return;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUserEmail,
        password: 'CargoTrack@123'
      });

      if (authError) {
        if (authError.message.includes('User already registered')) {
          const { error: insertError } = await supabase.from('profiles').insert({
            email: newUserEmail,
            role: newUserRole,
            company_id: currentUser?.company_id || null,
          });
          if (insertError) throw insertError;
          alert(`Convite criado! O usuário já possuía uma conta e o perfil foi criado.`);
          fetchUsers();
          setNewUserEmail('');
          setIsModalOpen(false);
          return;
        } else {
          throw authError;
        }
      }

      if (authData?.user?.id) {
        await supabase.from('profiles').upsert({
          id: authData.user.id,
          email: newUserEmail,
          role: newUserRole,
          company_id: currentUser?.company_id || null
        });
      }

      alert(`Usuário criado com sucesso!\n\nEmail: ${newUserEmail}\nSenha temporária: CargoTrack@123`);
      fetchUsers();
      setNewUserEmail('');
      setIsModalOpen(false);
      setNewUserEmail('');
      setNewUserRole('user');
      fetchUsers();
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error inviting new user:', err);
      alert('Error inviting new user: ' + (err.message || 'Check if email is already in use.'));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Access Management</h1>
            <p className="text-slate-500">Control users and system permissions.</p>
          </div>
        </div>
        <button
          onClick={() => { setEditingUser(null); setNewUserEmail(''); setNewUserRole('user'); setIsModalOpen(true); }}
          className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
        >
          + New Collaborator
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" /> Collaborators
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="p-12 text-center text-slate-400">Loading users...</div>
              ) : users.length === 0 ? (
                <div className="p-12 text-center text-slate-400">No users found.</div>
              ) : users.map(user => (
                <div key={user.id} className="p-6 hover:bg-slate-50 transition-colors group">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-lg border-2 border-white shadow-sm">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900">{user.email}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-widest ${user.role === 'super-admin' ? 'bg-purple-100 text-purple-600' :
                            user.role === 'company-admin' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                            }`}>
                            {user.role}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">ID: {user.id.slice(0, 8)}... {user.companies?.name && `· ${user.companies.name}`}</p>
                      </div>
                    </div>

                    <div className="flex-1 max-w-md">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Released Modules</p>
                      <div className="flex flex-wrap gap-1.5">
                        {user.user_module_access?.length > 0 ? user.user_module_access.map((acc: any) => (
                          <div key={acc.module_id} className="flex items-center bg-slate-100 rounded-md px-2 py-1">
                            <span className="text-[9px] font-bold text-slate-600 uppercase mr-1.5">{acc.module_id}</span>
                            <span className={`text-[8px] font-extrabold px-1 rounded ${acc.permission_type === 'edit' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>
                              {acc.permission_type.toUpperCase()}
                            </span>
                          </div>
                        )) : (
                          <span className="text-[10px] text-slate-300 italic">No access configured</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditingUser(user); setIsModalOpen(true); }}
                        className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
            <ShieldCheck className="w-8 h-8 text-blue-400 mb-4" />
            <h3 className="font-bold text-lg mb-2">Control Panel</h3>
            <p className="text-slate-400 text-xs leading-relaxed mb-6">
              As an administrator, you can manage collaborators in your organization and define the level of permission (View/Edit) for each module.
            </p>
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Current Company</p>
              <p className="text-sm font-bold truncate">{currentUser?.company_name || 'CargoTrack Global'}</p>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-900">{editingUser ? 'Edit Collaborator' : 'New Collaborator'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors font-bold text-slate-400">×</button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              {!editingUser && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Collaborator Email</label>
                  <input
                    type="email"
                    placeholder="email@company.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Role</label>
                  <select
                    value={editingUser?.role || newUserRole}
                    onChange={(e) => {
                      if (editingUser) {
                        setEditingUser({ ...editingUser, role: e.target.value as UserRole });
                      } else {
                        setNewUserRole(e.target.value as UserRole);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none"
                  >
                    <option value="user">User</option>
                    <option value="analyst">Analyst</option>
                    <option value="company-admin">Company Admin</option>
                    {currentUser?.role === 'super-admin' && <option value="super-admin">Super Admin</option>}
                  </select>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-4">Configure Module Access</p>
                <div className="space-y-3">
                  {availableModules.map(mod => {
                    const targetUser = editingUser || { user_module_access: [] };
                    const currentAccess = targetUser.user_module_access?.find((a: any) => a.module_id === mod.id);
                    return (
                      <div key={mod.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-2xl hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${currentAccess ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                          <span className="text-xs font-bold text-slate-700">{mod.label}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const newPerms = currentAccess ?
                                targetUser.user_module_access.filter((a: any) => a.module_id !== mod.id) :
                                [...(targetUser?.user_module_access || []), { module_id: mod.id, permission_type: 'view' }];
                              if (editingUser) {
                                setEditingUser({ ...editingUser, user_module_access: newPerms });
                              } else {
                                // For logic consistency, we'll need to store temporary perms for NEW users
                                // but for now we focus on finishing the creation first.
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase ${currentAccess ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                          >
                            {currentAccess ? 'Released' : 'Locked'}
                          </button>
                          {currentAccess && (
                            <select
                              value={currentAccess.permission_type}
                              onChange={(e) => {
                                const newPerms = targetUser.user_module_access.map((a: any) => a.module_id === mod.id ? { ...a, permission_type: e.target.value as PermissionType } : a);
                                if (editingUser) {
                                  setEditingUser({ ...editingUser, user_module_access: newPerms });
                                }
                              }}
                              className="bg-white border border-slate-200 rounded-lg text-[9px] font-bold uppercase px-2 py-1 outline-none"
                            >
                              <option value="view">View</option>
                              <option value="edit">Edit</option>
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
              <button
                onClick={async () => {
                  if (editingUser) {
                    await savePermissions(editingUser.id, editingUser.user_module_access, editingUser.role);
                  } else {
                    await handleInviteNewUser();
                  }
                }}
                className="flex-[2] py-3 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all font-extrabold"
              >
                {editingUser ? 'Save Changes' : 'Invite Collaborator'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const PaymentsPanel = ({ onBack, profile }: { onBack: () => void, profile: Profile | null }) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterPaid, setFilterPaid] = useState(true);

  const [newPayment, setNewPayment] = useState<any>({
    type: 'monthly',
    document_type: 'NF',
    document_number: '',
    title: '',
    amount: '',
    description: '',
    due_date: new Date().toISOString().split('T')[0]
  });
  const [editPayment, setEditPayment] = useState<Payment | null>(null);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('due_date', { ascending: true });
      if (error) throw error;
      setPayments(data || []);
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [profile]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('payments').insert([{
        type: newPayment.type,
        document_type: newPayment.document_type,
        document_number: newPayment.document_number,
        title: newPayment.title,
        amount: parseFloat(newPayment.amount),
        description: newPayment.description,
        due_date: newPayment.due_date,
        company_id: profile?.company_id || null,
        status: 'pending'
      }]);
      if (error) throw error;
      setShowCreateModal(false);
      fetchPayments();
      setNewPayment({
        type: 'monthly',
        document_type: 'NF',
        document_number: '',
        title: '',
        amount: '',
        description: '',
        due_date: new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      console.error(err);
      alert('Error creating payment record');
    }
  };

  const markAsPaid = async (id: string) => {
    try {
      const paymentToUpdate = payments.find(p => p.id === id);
      const { error } = await supabase
        .from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      
      if (paymentToUpdate && paymentToUpdate.type === 'monthly') {
        const nextDue = new Date(paymentToUpdate.due_date);
        nextDue.setMonth(nextDue.getMonth() + 1);
        
        await supabase.from('payments').insert([{
          type: 'monthly',
          document_type: paymentToUpdate.document_type,
          document_number: paymentToUpdate.document_number,
          title: paymentToUpdate.title,
          amount: paymentToUpdate.amount,
          description: paymentToUpdate.description,
          due_date: nextDue.toISOString().split('T')[0],
          company_id: paymentToUpdate.company_id,
          status: 'pending'
        }]);
      }

      fetchPayments();
    } catch (err) {
      alert('Error updating status');
    }
  };

  const markAsInProgress = async (id: string) => {
    try {
      const { error } = await supabase.from('payments').update({ status: 'in_progress' }).eq('id', id);
      if (error) throw error;
      fetchPayments();
    } catch { alert('Error updating status'); }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPayment) return;
    try {
      const { error } = await supabase.from('payments')
        .update({
          title: editPayment.title,
          document_type: editPayment.document_type,
          document_number: editPayment.document_number,
          amount: editPayment.amount,
          description: editPayment.description,
          due_date: editPayment.due_date,
          type: editPayment.type,
        })
        .eq('id', editPayment.id);
      if (error) throw error;
      setEditPayment(null);
      fetchPayments();
    } catch { alert('Error saving payment'); }
  };

  const getStatusDetails = (payment: Payment) => {
    if (payment.status === 'paid') return { label: 'Pago', color: 'bg-emerald-100 text-emerald-600', icon: CheckCircle2 };
    if (payment.status === 'in_progress') return { label: 'Em Aprovação', color: 'bg-violet-100 text-violet-600', icon: Clock };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(payment.due_date);
    due.setHours(0, 0, 0, 0);

    if (due < today) return { label: 'Overdue', color: 'bg-red-100 text-red-600', icon: AlertTriangle };

    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 3) return { label: 'Near Expiry', color: 'bg-amber-100 text-amber-600', icon: Bell };

    return { label: 'Pending', color: 'bg-blue-100 text-blue-600', icon: Clock };
  };

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const active = payments.filter(p => p.status === 'pending');

    return {
      totalPending: active.length,
      overdue: active.filter(p => new Date(p.due_date) < today).length,
      nearExpiry: active.filter(p => {
        const due = new Date(p.due_date);
        const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 3;
      }).length,
      totalAmount: active.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
    };
  }, [payments]);

  const filteredPayments = filterPaid ? payments.filter(p => p.status !== 'paid') : payments;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Payments & Financial</h1>
            <p className="text-slate-500">Manage invoices, extra services and recurring payments.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFilterPaid(!filterPaid)}
            className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${filterPaid ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-600'
              }`}
          >
            {filterPaid ? 'Showing Pending Only' : 'Showing All Payments'}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-2 bg-rose-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Payment
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg"><Clock className="w-4 h-4 text-blue-600" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Pending</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.totalPending}</p>
          <p className="text-xs text-slate-500 mt-1">Awaiting payment</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 rounded-lg"><Bell className="w-4 h-4 text-amber-600" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Near Expiry</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{stats.nearExpiry}</p>
          <p className="text-xs text-slate-500 mt-1">Due in 1-3 days</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-red-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle className="w-4 h-4 text-red-600" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Overdue</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
          <p className="text-xs text-slate-500 mt-1">Expired documents</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/10 rounded-lg"><Calculator className="w-4 h-4 text-blue-400" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Balance Payable</span>
          </div>
          <p className="text-2xl font-bold text-white">R$ {stats.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-slate-500 mt-1">Sum of all pending</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Título / Doc</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Due Date</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">Loading records...</td></tr>
              ) : filteredPayments.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">No records found.</td></tr>
              ) : filteredPayments.map(p => {
                const status = getStatusDetails(p);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{p.title || `${p.document_type} ${p.document_number || '---'}`}</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{p.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${p.type === 'monthly' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-600'
                        }`}>
                        {p.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <p className="text-xs font-medium text-slate-700">{new Date(p.due_date).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900 text-sm">
                      R$ {Number(p.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${status.color}`}>
                        <status.icon className="w-3 h-3" />
                        <span className="text-[10px] font-bold uppercase">{status.label}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex items-center gap-2 justify-end flex-wrap">
                         <button onClick={() => setEditPayment(p)} className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors" title="Editar">
                           <Edit2 className="w-3 h-3" />
                         </button>
                         {p.status === 'pending' && (
                           <button onClick={() => markAsInProgress(p.id)} className="px-2 py-1.5 bg-violet-50 text-violet-600 rounded-lg text-[10px] font-bold hover:bg-violet-100 transition-colors whitespace-nowrap">
                             Em Aprovação
                           </button>
                         )}
                         {(p.status === 'pending' || p.status === 'in_progress') && (
                           <button onClick={() => markAsPaid(p.id)} className="px-2 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold hover:bg-emerald-100 transition-colors whitespace-nowrap">
                             Marcar Pago
                           </button>
                         )}
                         {p.status === 'paid' && (
                           <div className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                             Pago {p.paid_at ? new Date(p.paid_at).toLocaleDateString('pt-BR') : ''}
                           </div>
                         )}
                       </div>
                     </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-900">New Payment/Service</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors font-bold text-slate-400">×</button>
            </div>

            <form onSubmit={handleCreate} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Título do Pagamento</label>
                <input
                  type="text"
                  placeholder="Ex: Frete NF 001 - Janeiro"
                  value={newPayment.title}
                  onChange={(e) => setNewPayment({ ...newPayment, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Payment Type</label>
                  <select
                    value={newPayment.type}
                    onChange={(e) => setNewPayment({ ...newPayment, type: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none"
                  >
                    <option value="monthly">Monthly Recurring</option>
                    <option value="extra">Extra Service</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Document Type</label>
                  <select
                    value={newPayment.document_type}
                    onChange={(e) => setNewPayment({ ...newPayment, document_type: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none"
                  >
                    <option value="NF">Nota Fiscal (NF)</option>
                    <option value="ND">Nota de Débito (ND)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Doc Number</label>
                  <input
                    type="text"
                    required
                    placeholder="000.000"
                    value={newPayment.document_number}
                    onChange={(e) => setNewPayment({ ...newPayment, document_number: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Value (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0,00"
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={newPayment.due_date}
                  onChange={(e) => setNewPayment({ ...newPayment, due_date: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Description</label>
                <textarea
                  placeholder="Details about the service..."
                  value={newPayment.description}
                  onChange={(e) => setNewPayment({ ...newPayment, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none h-24 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                <button
                  type="submit"
                  className="flex-[2] py-3 bg-rose-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all font-extrabold"
                >
                  Register Payment
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editPayment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-900">Editar Pagamento</h3>
              <button onClick={() => setEditPayment(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 text-xl font-bold">×</button>
            </div>
            <form onSubmit={handleEditSave} className="p-8 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-1">Título</label>
                <input type="text" value={editPayment.title || ''} onChange={e => setEditPayment({...editPayment, title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none" placeholder="Título do pagamento" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-1">Tipo Doc.</label>
                  <select value={editPayment.document_type} onChange={e => setEditPayment({...editPayment, document_type: e.target.value as any})} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none">
                    <option value="NF">NF</option><option value="ND">ND</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-1">Nº Documento</label>
                  <input type="text" value={editPayment.document_number || ''} onChange={e => setEditPayment({...editPayment, document_number: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-1">Valor (R$)</label>
                  <input type="number" step="0.01" value={editPayment.amount} onChange={e => setEditPayment({...editPayment, amount: parseFloat(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-1">Vencimento</label>
                  <input type="date" value={editPayment.due_date} onChange={e => setEditPayment({...editPayment, due_date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-1">Descrição</label>
                <textarea value={editPayment.description || ''} onChange={e => setEditPayment({...editPayment, description: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none h-20 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditPayment(null)} className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all">Cancelar</button>
                <button type="submit" className="flex-[2] py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all">Salvar Alterações</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const RoutingPanel = ({ onBack }: { onBack: () => void }) => {
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');

  const distanceMap: Record<string, number> = {
    'Santarém': 600,
    'Porto Velho': 1000,
    'Rio Branco': 1500,
    'Belém': 1800,
    'Cuiabá': 2300,
    'Goiânia': 2800,
    'Brasília': 3100,
    'São Paulo': 3800,
    'Rio de Janeiro': 3900,
    'Curitiba': 4000
  };

  const addStop = () => {
    if (!newCity || !newState) return;
    const dist = distanceMap[newCity] || Math.floor(Math.random() * 4000) + 1000;
    setStops([...stops, { id: Math.random().toString(), city: newCity, state: newState, distanceFromMAO: dist }]);
    setNewCity('');
    setNewState('');
  };

  const optimizeRoute = () => {
    const sorted = [...stops].sort((a, b) => a.distanceFromMAO - b.distanceFromMAO);
    setStops(sorted);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Route Optimization</h1>
            <p className="text-slate-500">LTL Fracionada · Origin: Manaus (MAO)</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm h-fit">
          <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" /> Add Destination
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">City</label>
              <input
                placeholder="Ex: Santarém"
                value={newCity}
                onChange={e => setNewCity(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">State</label>
              <input
                placeholder="Ex: PA"
                value={newState}
                onChange={e => setNewState(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={addStop}
              className="w-full py-3 bg-blue-600 text-white font-extrabold rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
            >
              Add to Route
            </button>
          </div>

          <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-[10px] font-extrabold text-amber-700 uppercase mb-1 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Tip
            </p>
            <p className="text-[10px] text-amber-600 leading-relaxed font-medium">
              Start with the nearest cities to Manaus to reduce transit lead-times and optimize delivery costs.
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 rounded-2xl p-6 text-white flex justify-between items-center shadow-xl">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Route className="w-5 h-5 text-blue-400" /> Sequence Optimization
              </h3>
              <p className="text-slate-400 text-xs">Algorithm based on proximity from origin.</p>
            </div>
            <button
              onClick={optimizeRoute}
              disabled={stops.length < 2}
              className="px-6 py-2 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:grayscale"
            >
              Optimize Sequence
            </button>
          </div>

          <div className="relative space-y-4">
            {/* Origin */}
            <div className="flex items-center gap-4 bg-blue-600/10 border border-blue-600/30 rounded-2xl p-4 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center font-extrabold text-white shadow-lg border-4 border-white">
                00
              </div>
              <div className="flex-1">
                <p className="text-sm font-extrabold text-slate-900">Manaus (MAO)</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[8px] font-bold rounded uppercase">Origin</span>
                  <p className="text-[10px] font-bold text-slate-400">AMAZONAS · BRASIL</p>
                </div>
              </div>
            </div>

            {/* Stops */}
            <div className="space-y-4 relative">
              {stops.map((s, idx) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 group relative hover:border-blue-200 transition-colors shadow-sm"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-extrabold text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors border-4 border-white">
                    {(idx + 1).toString().padStart(2, '0')}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">{s.city}, {s.state}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Est. Distance: {s.distanceFromMAO} km</p>
                      <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                      <p className="text-[10px] font-bold text-emerald-600 uppercase italic">In Range</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setStops(stops.filter(x => x.id !== s.id))}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </motion.div>
              ))}
            </div>

            {stops.length === 0 && (
              <div className="py-24 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                <MapPin className="w-12 h-12 mx-auto mb-4 opacity-10" />
                <p className="text-sm font-bold opacity-60">No destinations added to the route.</p>
                <p className="text-[10px] font-medium opacity-40 mt-1 uppercase tracking-widest">Add cities to unlock optimization</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const FleetRegistrationPanel = ({ onBack, profile }: { onBack: () => void, profile: Profile | null }) => {
  const [registrations, setRegistrations] = useState<FleetRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReg, setEditingReg] = useState<Partial<FleetRegistration> | null>(null);
  const [seals, setSeals] = useState<string[]>([]);
  const [sealInput, setSealInput] = useState('');
  const [photos, setPhotos] = useState<{ file: File, preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchRegistrations();
  }, [profile]);

  const fetchRegistrations = async () => {
    setLoading(true);
    try {
      let query = supabase.from('fleet_registrations').select('*');
      if (profile?.role !== 'super-admin' && profile?.company_id) {
        query = query.eq('company_id', profile.company_id);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      setRegistrations(data || []);
    } catch (err) {
      console.error('Error fetching registrations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((f: File) => ({
        file: f,
        preview: URL.createObjectURL(f)
      }));
      setPhotos([...photos, ...newFiles]);
    }
  };

  const saveRegistration = async (isFinal: boolean) => {
    if (!profile?.company_id) {
      alert('Must be logged in to save.');
      return;
    }

    setUploading(true);
    try {
      const uploadedPhotos = [];
      for (const p of photos) {
        const fileExt = p.file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `fleet/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from('fleet_photos')
          .upload(filePath, p.file);

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('fleet_photos')
          .getPublicUrl(filePath);

        uploadedPhotos.push({
          url: urlData.publicUrl,
          name: p.file.name,
          type: p.file.type
        });
      }

      const payload = {
        carrier: editingReg?.carrier,
        vehicle_plate: editingReg?.vehicle_plate,
        driver_name: editingReg?.driver_name,
        seals: seals,
        photos: [...(editingReg?.photos || []), ...uploadedPhotos],
        status: isFinal ? 'finalized' : 'draft',
        company_id: profile.company_id,
        created_by: profile.id
      };

      if (editingReg?.id) {
        const { error } = await supabase
          .from('fleet_registrations')
          .update(payload)
          .eq('id', editingReg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('fleet_registrations')
          .insert([payload]);
        if (error) throw error;
      }

      if (isFinal) {
        alert('Record finalized! (Email sending trigger initialized)');
      } else {
        alert('Draft saved successfully.');
      }

      setShowForm(false);
      setEditingReg(null);
      setPhotos([]);
      setSeals([]);
      fetchRegistrations();
    } catch (err: any) {
      console.error(err);
      alert('Error saving: ' + (err.message || 'Check console'));
    } finally {
      setUploading(false);
    }
  };

  const startNew = () => {
    setEditingReg({});
    setSeals([]);
    setPhotos([]);
    setShowForm(true);
  };

  const editReg = (reg: FleetRegistration) => {
    setEditingReg(reg);
    setSeals(reg.seals || []);
    setPhotos([]);
    setShowForm(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Fleet Control <span className="text-blue-600">& Loading</span></h1>
            <p className="text-slate-500 font-medium mt-1">Audit vehicle plates, document seals and load evidence photos.</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={startNew}
            className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-extrabold text-sm shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-2"
          >
            <Camera className="w-4 h-4" /> Start New Audit
          </button>
        )}
      </div>

      {showForm ? (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl overflow-hidden">
          <div className="p-8 lg:p-12 grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div className="space-y-10">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
                  <Truck className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900">General Information</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Transportation Company</label>
                  <input
                    value={editingReg?.carrier || ''}
                    onChange={e => setEditingReg({ ...editingReg, carrier: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    placeholder="Enter carrier name..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Vehicle Plate</label>
                  <input
                    value={editingReg?.vehicle_plate || ''}
                    onChange={e => setEditingReg({ ...editingReg, vehicle_plate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold placeholder:font-sans placeholder:font-normal"
                    placeholder="ABC-1234"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Driver's Full Name</label>
                <div className="relative">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={editingReg?.driver_name || ''}
                    onChange={e => setEditingReg({ ...editingReg, driver_name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    placeholder="Who is driving today?"
                  />
                </div>
              </div>

              <div className="space-y-6 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Security Seal Numbers</label>
                <div className="flex gap-2">
                  <input
                    value={sealInput}
                    onChange={e => setSealInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), sealInput && (setSeals([...seals, sealInput]), setSealInput('')))}
                    className="flex-1 bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none font-bold text-blue-600"
                    placeholder="Enter seal ID..."
                  />
                  <button
                    onClick={() => { if (sealInput) { setSeals([...seals, sealInput]); setSealInput(''); } }}
                    className="px-5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {seals.map(s => (
                    <span key={s} className="px-3 py-1.5 bg-white border border-blue-100 text-blue-600 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm animate-in fade-in zoom-in duration-200">
                      {s} <button onClick={() => setSeals(seals.filter(x => x !== s))} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {seals.length === 0 && <p className="text-[10px] text-slate-400 font-medium italic">No seals registered yet.</p>}
                </div>
              </div>
            </div>

            <div className="space-y-10">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-6">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                  <Camera className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900">Audit Proofs</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {/* Existing Database Photos */}
                {editingReg?.photos?.map((p, i) => (
                  <div key={`db-${i}`} className="aspect-square rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 relative group shadow-sm">
                    <img src={p.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-[10px] text-white font-extrabold uppercase">Stored</span>
                    </div>
                  </div>
                ))}

                {/* New local uploads */}
                {photos.map((p, i) => (
                  <div key={`loc-${i}`} className="aspect-square rounded-2xl bg-slate-100 overflow-hidden border-2 border-blue-400 relative group shadow-lg animate-in fade-in scale-95 transition-all">
                    <img src={p.preview} className="w-full h-full object-cover" />
                    <button
                      onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                      className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full text-red-500 shadow-lg hover:bg-red-500 hover:text-white transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-blue-600/80 p-1.5 text-center">
                      <span className="text-[8px] text-white font-extrabold uppercase tracking-widest">New Upload</span>
                    </div>
                  </div>
                ))}

                {/* Add Photo Button */}
                <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-all group">
                  <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors mb-3">
                    <Plus className="w-6 h-6 text-slate-300 group-hover:text-blue-500" />
                  </div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest group-hover:text-blue-500">Capture Proof</span>
                  <input type="file" multiple accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </label>
              </div>

              <div className="p-6 bg-slate-900 rounded-3xl text-white shadow-xl">
                <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-400" /> Audit Integrity
                </h4>
                <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                  Photos must be clear showing the vehicle plate and the locked seal. Finalizing this audit will freeze editing and trigger an automated report to HQ.
                </p>
              </div>
            </div>
          </div>

          <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-6">
            <button
              onClick={() => { if (window.confirm('Discard all changes?')) setShowForm(false); }}
              className="text-sm font-extrabold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Discard Audit Data
            </button>
            <div className="flex w-full sm:w-auto gap-4">
              <button
                onClick={() => saveRegistration(false)}
                disabled={uploading}
                className="flex-1 sm:px-8 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-extrabold text-xs shadow-sm hover:bg-slate-100 transition-all disabled:opacity-50"
              >
                {uploading ? 'Wait...' : 'Keep as Draft'}
              </button>
              <button
                onClick={() => saveRegistration(true)}
                disabled={uploading}
                className="flex-[2] sm:px-12 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs shadow-2xl shadow-blue-900/40 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest"
              >
                {uploading ? 'Processing File Transfer...' : 'Finalize & Send Report'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {registrations.map(reg => (
            <motion.div
              layout
              key={reg.id}
              className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm hover:shadow-2xl hover:border-blue-100 transition-all group relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${reg.status === 'finalized' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                  {reg.status}
                </div>
                <div className="flex items-center gap-1.5 opacity-40">
                  <Clock className="w-3 h-3" />
                  <span className="text-[10px] font-bold">{new Date(reg.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-black text-slate-900 text-2xl tracking-tighter group-hover:text-blue-600 transition-colors">{reg.vehicle_plate}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.1em] mt-1">{reg.carrier || 'Unknown Carrier'}</p>
              </div>

              <div className="flex -space-x-3 mb-8">
                {reg.photos?.slice(0, 5).map((p, i) => (
                  <div key={i} className="w-12 h-12 rounded-full border-4 border-white overflow-hidden bg-slate-100 shadow-md">
                    <img src={p.url} className="w-full h-full object-cover" />
                  </div>
                ))}
                {(reg.photos?.length || 0) > 5 && (
                  <div className="w-12 h-12 rounded-full border-4 border-white bg-slate-900 flex items-center justify-center text-[10px] font-bold text-white shadow-md">
                    +{(reg.photos?.length || 0) - 5}
                  </div>
                )}
                {(reg.photos?.length || 0) === 0 && (
                  <div className="w-12 h-12 rounded-full border-4 border-white bg-slate-100 flex items-center justify-center text-slate-300 italic shadow-md">
                    <Camera className="w-5 h-5" />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs border-t border-slate-50 pt-4">
                  <span className="text-slate-400 font-bold uppercase tracking-widest">Driver</span>
                  <span className="text-slate-900 font-extrabold truncate max-w-[150px]">{reg.driver_name || '---'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-widest">Active Seals</span>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg font-black">{reg.seals?.length || 0}</span>
                </div>
              </div>

              <button
                onClick={() => editReg(reg)}
                className="w-full mt-8 py-4 bg-slate-50 text-slate-600 rounded-[1.25rem] font-extrabold text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:shadow-lg transition-all"
              >
                {reg.status === 'finalized' ? 'Audit Summary' : 'Resume Audit'}
              </button>
            </motion.div>
          ))}

          {loading && (
            <div className="col-span-full py-24 flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Syncing with fleet server...</p>
            </div>
          )}

          {!loading && registrations.length === 0 && (
            <div className="col-span-full py-32 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/50">
              <History className="w-16 h-16 mx-auto mb-6 opacity-5" />
              <p className="text-lg font-black text-slate-900 opacity-20 uppercase tracking-tighter">No Fleet History Found</p>
              <p className="text-xs font-bold opacity-30 mt-2">Start your first audit using the button above.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DocsPanel = ({ onBack, profile }: { onBack: () => void, profile: Profile | null }) => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Partial<Document> | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'All' | 'Tercerizados' | 'SGI' | 'Contratos'>('All');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    fetchDocs();
  }, [profile]);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      let query = supabase.from('documents').select('*');
      if (profile?.role !== 'super-admin' && profile?.company_id) {
        query = query.eq('company_id', profile.company_id);
      }
      const { data, error } = await query.order('expiry_date', { ascending: true });
      if (error) throw error;
      setDocs(data || []);
    } catch (err) {
      console.error('Error fetching docs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.company_id) return;

    setUploading(true);
    try {
      let fileUrl = editingDoc?.file_url;

      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `docs/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        fileUrl = urlData.publicUrl;
      }

      const payload = {
        name: editingDoc?.name,
        category: editingDoc?.category,
        subcategory: editingDoc?.subcategory,
        type: editingDoc?.type,
        issue_date: editingDoc?.issue_date,
        expiry_date: editingDoc?.expiry_date,
        file_url: fileUrl,
        company_id: profile.company_id,
        created_by: profile.id
      };

      if (editingDoc?.id) {
        const { error } = await supabase.from('documents').update(payload).eq('id', editingDoc.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('documents').insert([payload]);
        if (error) throw error;
      }

      setShowModal(false);
      setEditingDoc(null);
      setSelectedFile(null);
      fetchDocs();
    } catch (err) {
      console.error('Error saving doc:', err);
      alert('Error saving document. Make sure the "documents" storage bucket exists.');
    } finally {
      setUploading(false);
    }
  };

  const getStatus = (expiryDate?: string) => {
    if (!expiryDate) return { label: 'Permanent', color: 'bg-emerald-50 text-emerald-600', icon: ShieldCheck };
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diff = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    if (diff < 0) return { label: 'Expired', color: 'bg-red-50 text-red-600', icon: AlertTriangle };
    if (diff <= 30) return { label: 'Expiring Soon', color: 'bg-amber-50 text-amber-600', icon: Clock };
    return { label: 'Active', color: 'bg-emerald-50 text-emerald-600', icon: ShieldCheck };
  };

  const filteredDocs = docs.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.subcategory?.toLowerCase().includes(search.toLowerCase()) ||
      d.type.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'All' || d.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const stats = [
    { label: 'Total', count: docs.length, color: 'text-slate-900', icon: FileText },
    { label: 'Expired', count: docs.filter(d => getStatus(d.expiry_date).label === 'Expired').length, color: 'text-red-600', icon: AlertTriangle },
    { label: 'Expiring soon', count: docs.filter(d => getStatus(d.expiry_date).label === 'Expiring Soon').length, color: 'text-amber-600', icon: Clock },
    { label: 'Active', count: docs.filter(d => getStatus(d.expiry_date).label === 'Active').length, color: 'text-emerald-600', icon: ShieldCheck },
  ];

  const groupedDocs = useMemo<Record<string, Document[]>>(() => {
    if (filterCategory !== 'Tercerizados') return { 'All Documents': filteredDocs };
    const groups: Record<string, Document[]> = {};
    filteredDocs.forEach(doc => {
      const key = doc.subcategory || 'Uncategorized Company';
      if (!groups[key]) groups[key] = [];
      groups[key].push(doc);
    });
    return groups;
  }, [filteredDocs, filterCategory]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight letters text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600">Documentation Module</h1>
            <p className="text-slate-500 font-medium mt-1">Real-time compliance engine for integrated logistics.</p>
          </div>
        </div>
        <button
          onClick={() => { setEditingDoc({ category: 'Tercerizados' }); setShowModal(true); }}
          className="px-6 py-3 bg-cyan-600 text-white rounded-2xl font-extrabold text-sm shadow-xl shadow-cyan-100 hover:bg-cyan-700 transition-all active:scale-95 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Document
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
        {stats.map(s => (
          <div key={s.label} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-cyan-200 transition-all">
            <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity`}>
              <s.icon className="w-16 h-16" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-4xl font-black ${s.color}`}>{s.count.toString().padStart(2, '0')}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
        <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row gap-6 items-center justify-between bg-slate-50/30">
          <div className="relative w-full md:w-[400px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              placeholder="Search by name, company or type..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-12 pr-4 text-sm outline-none focus:ring-2 focus:ring-cyan-500 shadow-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl">
            {['All', 'Tercerizados', 'SGI', 'Contratos'].map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat as any)}
                className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${filterCategory === cat ? 'bg-white text-cyan-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="p-8 space-y-12">
          {(Object.entries(groupedDocs) as [string, Document[]][]).map(([groupName, docsInGroup]) => (
            <div key={groupName} className="space-y-4">
              {filterCategory === 'Tercerizados' && (
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-1.5 h-6 bg-cyan-500 rounded-full" />
                  <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase tracking-widest text-xs opacity-40">{groupName}</h3>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {docsInGroup.map(doc => {
                  const status = getStatus(doc.expiry_date);
                  return (
                    <motion.div
                      key={doc.id}
                      layout
                      onClick={() => { setEditingDoc(doc); setShowModal(true); }}
                      className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:border-cyan-100 transition-all cursor-pointer group relative overflow-hidden"
                    >
                      <div className={`absolute top-0 right-0 w-1 pt-6 pb-6 h-full ${status.color.replace('bg-', 'bg-').split(' ')[0]}`} />

                      <div className="flex justify-between items-start mb-6">
                        <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-cyan-50 text-slate-400 group-hover:text-cyan-600 transition-colors">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${status.color}`}>
                          {status.label}
                        </div>
                      </div>

                      <h4 className="text-lg font-black text-slate-900 group-hover:text-cyan-600 transition-colors line-clamp-1">{doc.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{doc.type}</p>

                      <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-extrabold text-slate-600">
                            {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString('pt-BR') : 'No date'}
                          </span>
                        </div>
                        {doc.file_url && (
                          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Download className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}

          {!loading && filteredDocs.length === 0 && (
            <div className="py-24 text-center">
              <div className="flex flex-col items-center opacity-10">
                <FileText className="w-24 h-24 mb-6" />
                <p className="font-black uppercase tracking-[0.2em] text-lg">Empty Vault</p>
                <p className="text-xs font-bold mt-2">No documents found matching your criteria</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="py-24 flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-cyan-100 border-t-cyan-500 rounded-full animate-spin" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Encrypting protocols...</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-white/20">
            <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">{editingDoc?.id ? 'System Update' : 'New Protocol'}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Regulatory & Compliance Entry</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors font-bold text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-10 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Document Label</label>
                  <input
                    required
                    value={editingDoc?.name || ''}
                    onChange={e => setEditingDoc({ ...editingDoc, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm outline-none focus:ring-2 focus:ring-cyan-500 font-bold"
                    placeholder="Ex: ASO Johny S."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Document Type</label>
                  <input
                    required
                    value={editingDoc?.type || ''}
                    onChange={e => setEditingDoc({ ...editingDoc, type: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm outline-none focus:ring-2 focus:ring-cyan-500 font-bold"
                    placeholder="Ex: ASO, Training..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Classification</label>
                  <select
                    value={editingDoc?.category || 'Tercerizados'}
                    onChange={e => setEditingDoc({ ...editingDoc, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm outline-none focus:ring-2 focus:ring-cyan-500 font-bold appearance-none cursor-pointer"
                  >
                    <option value="Tercerizados">Tercerizados (Partners)</option>
                    <option value="SGI">SGI (Internal)</option>
                    <option value="Contratos">Contratos (Legal)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Responsible Entity / Company</label>
                  <input
                    value={editingDoc?.subcategory || ''}
                    onChange={e => setEditingDoc({ ...editingDoc, subcategory: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm outline-none focus:ring-2 focus:ring-cyan-500 font-bold"
                    placeholder="Ex: Yusen Logistics..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Issue Date</label>
                  <input
                    type="date"
                    value={editingDoc?.issue_date || ''}
                    onChange={e => setEditingDoc({ ...editingDoc, issue_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm outline-none focus:ring-2 focus:ring-cyan-500 font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Expiration Deadline</label>
                  <input
                    type="date"
                    value={editingDoc?.expiry_date || ''}
                    onChange={e => setEditingDoc({ ...editingDoc, expiry_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm outline-none focus:ring-2 focus:ring-cyan-500 font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Digital Evidence (PDF / IMG)</label>
                <div className="relative group">
                  <input
                    type="file"
                    onChange={e => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                    className="hidden"
                    id="doc-file-upload"
                  />
                  <label
                    htmlFor="doc-file-upload"
                    className="flex items-center justify-between w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl py-4 px-6 cursor-pointer group-hover:border-cyan-500 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Download className="w-5 h-5 text-slate-400 group-hover:text-cyan-500" />
                      <span className="text-sm font-bold text-slate-500 group-hover:text-cyan-600">
                        {selectedFile ? selectedFile.name : editingDoc?.file_url ? 'file-stored-on-cloud.pdf' : 'Select file to upload...'}
                      </span>
                    </div>
                    {selectedFile && <div className="px-3 py-1 bg-cyan-100 text-cyan-600 rounded-lg text-[10px] font-black uppercase">Selected</div>}
                  </label>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-[2] py-4 bg-cyan-600 text-white font-black rounded-2xl shadow-2xl shadow-cyan-900/20 hover:bg-cyan-700 transition-all active:scale-95 uppercase tracking-widest text-xs disabled:opacity-50"
                >
                  {uploading ? 'Synching Filesystem...' : editingDoc?.id ? 'Commit Updates' : 'Authorize Protocol'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};


const Login = ({ onLogin }: { onLogin: (session: any) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Bypass for super-admin using env variables
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;

    if (adminEmail && adminPassword && email === adminEmail && password === adminPassword) {
      onLogin({ user: { email, id: '00000000-0000-0000-0000-000000000000' } });
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onLogin(data.session);
    } catch (err: any) {
      setError(err.message || 'Erro ao acessar o sistema');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#1e293b_0%,#0f172a_100%)]" />
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="bg-blue-600 p-4 rounded-2xl shadow-xl shadow-blue-900/40 mb-4">
            <Package className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">CargoTrack <span className="text-blue-500">Pro</span></h1>
          <p className="text-slate-400 mt-2 text-sm">Corporate Authentication Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Corporate Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800/50 border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-slate-800/80 transition-all font-medium"
                placeholder="name@company.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Access Password</label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800/50 border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-slate-800/80 transition-all font-medium"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-4 rounded-2xl shadow-lg shadow-blue-900/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Enter System'}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-white/5 text-center">
          <p className="text-slate-500 text-xs font-medium">Forgot your password? <span className="text-blue-500 hover:underline cursor-pointer">Recover access</span></p>
        </div>
      </motion.div>

      <div className="absolute bottom-8 text-center text-slate-600 text-[10px] font-bold uppercase tracking-[0.3em] opacity-40">
        CargoTrack Logistics Pro · Security Standard v3.0
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<ModuleAccess[]>([]);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [isRightMenuExpanded, setIsRightMenuExpanded] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', msg: 'Oi! Sou a Pam. Como posso analisar sua operação hoje?' }
  ]);

  const modules = [
    { id: 'pam', title: 'Pam AI', desc: 'Assistente Inteligente', icon: Sparkles, color: 'bg-orange-50 text-orange-600', status: 'Active' },
    { id: 'daily-schedule', title: 'Programação Diária', desc: 'Carregamento Kanban', icon: Calendar, color: 'bg-blue-50 text-blue-600', status: 'Active' },
    { id: 'dashboard', title: 'Shipments', desc: 'Operational overview', icon: Truck, color: 'bg-emerald-50 text-emerald-600', status: 'Active' },
    { id: 'routing', title: 'CargoFit / Routing', desc: 'Trailer occupation', icon: Route, color: 'bg-indigo-50 text-indigo-600', status: 'New' },
    { id: 'freight-calc', title: 'Freight Control', desc: 'Cost optimization', icon: Calculator, color: 'bg-amber-50 text-amber-600', status: 'Static', noClick: true },
    { id: 'fork-manager', title: 'ForkManager', desc: 'Fleet maintenance', icon: Zap, color: 'bg-orange-50 text-orange-600', status: 'Active' },
    { id: 'payments', title: 'Payments', desc: 'Invoices & slips', icon: CreditCard, color: 'bg-rose-50 text-rose-600', status: 'Active' },
    { id: 'docs', title: 'Documents', desc: 'SGI & contracts', icon: ShieldCheck, color: 'bg-cyan-50 text-cyan-600', status: 'Active' },
    { id: 'fleet', title: 'Fleet Registry', desc: 'Vehicle loading', icon: Camera, color: 'bg-slate-100 text-slate-600', status: 'Active' },
  ];

  const hasAccess = (modId: string) => {
    if (profile?.role === 'super-admin') return true;
    return permissions.some(p => p.module_id === modId);
  };
  
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMsg.trim()) return;
    setChatHistory([...chatHistory, { role: 'user', msg: chatMsg }, { role: 'ai', msg: 'Anotado. Estou analisando seus dados, mas como sou uma IA demonstrativa, ainda não efetuo alterações profundas na sua base.' }]);
    setChatMsg('');
  };
  const [view, setView] = useState<'home' | 'dashboard' | 'daily-schedule' | 'freight-calc' | 'cargo-fit' | 'fork-manager' | 'payments' | 'docs' | 'routing' | 'fleet' | 'settings'>('home');
  const [activeTab, setActiveTab] = useState('home');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadUserData();
      fetchShipments();
    }
  }, [session]);

  const loadUserData = async () => {
    if (!session) return;

    // Super admin bypass
    if (session.user.id === '00000000-0000-0000-0000-000000000000') {
      setProfile({
        id: '00000000-0000-0000-0000-000000000000',
        email: session.user.email,
        role: 'super-admin'
      });
      return;
    }

    try {
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('*, companies(name)')
        .eq('id', session.user.id)
        .single();

      if (profErr) throw profErr;

      const { data: perms } = await supabase
        .from('user_module_access')
        .select('*')
        .eq('user_id', session.user.id);

      setProfile({
        ...prof,
        company_name: prof.companies?.name
      });
      setPermissions(perms || []);
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  };

  const fetchShipments = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('shipments')
        .select('*');

      if (profile?.role !== 'super-admin' && profile?.company_id) {
        query = query.eq('company_id', profile.company_id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // Map DB fields to camelCase if necessary, or ensure snake_case mapping
      const mappedShipments: Shipment[] = (data || []).map(s => ({
        id: s.id,
        code: s.code,
        mode: s.mode as TransportMode,
        origin: s.origin,
        destination: s.destination,
        status: s.status as ShipmentStatus,
        checkpoints: s.checkpoints,
        leadTime: s.lead_time,
        currentTransitTime: s.current_transit_time,
        departureDate: s.departure_date,
        carrier: s.carrier,
        cargoType: s.cargo_type as any,
        cargoDescription: s.cargo_description,
        value: s.value,
        plate: s.plate,
        seals: s.seals,
        booking: s.booking,
        trackingTag: s.tracking_tag,
        invoices: s.invoices || [],
        invoiceFileUrl: s.invoice_file_url,
        invoiceFileName: s.invoice_file_name
      }));

      setShipments(mappedShipments);
    } catch (err) {
      console.error('Error fetching shipments:', err);
      setShipments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectShipment = (s: Shipment) => {
    setSelectedShipment(s);
    setView('detail');
  };

  const handleCreateNew = () => {
    setView('create');
  };

  const handleSaveShipment = async (s: Shipment) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('shipments')
        .insert([{
          code: s.code,
          mode: s.mode,
          origin: s.origin,
          destination: s.destination,
          status: s.status,
          checkpoints: s.checkpoints,
          lead_time: s.leadTime,
          current_transit_time: s.currentTransitTime,
          departure_date: s.departureDate,
          carrier: s.carrier,
          cargo_type: s.cargoType,
          cargo_description: s.cargoDescription,
          value: s.value,
          plate: s.plate,
          seals: s.seals,
          booking: s.booking,
          tracking_tag: s.trackingTag,
          invoices: s.invoices,
          invoice_file_url: s.invoiceFileUrl,
          invoice_file_name: s.invoiceFileName,
          user_id: session?.user.id === '00000000-0000-0000-0000-000000000000' ? null : session?.user.id,
          company_id: profile?.company_id || null
        }]);

      if (error) {
        console.error('Database detailed error:', error);
        throw error;
      }

      await fetchShipments();
      alert('Embarque salvo com sucesso no banco de dados!');
      setView('dashboard');
    } catch (err: any) {
      console.error('Error saving shipment:', err);
      alert('Erro ao salvar no banco de dados: ' + (err.message || 'Erro desconhecido. Verifique o console.'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteShipment = async (id: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('shipments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      alert('Embarque apagado com sucesso!');
      setView('dashboard');
      await fetchShipments();
    } catch (err: any) {
      console.error('Error deleting shipment:', err);
      alert('Erro ao apagar: ' + (err.message || 'Erro desconhecido.'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (updatedCheckpoints: Checkpoint[]) => {
    if (!selectedShipment) return;

    try {
      // Determine overall status
      let newStatus: ShipmentStatus = 'on-route';
      const allCompleted = updatedCheckpoints.every(cp => cp.status === 'completed');

      if (allCompleted) {
        newStatus = 'completed';
      } else {
        const hasDelay = updatedCheckpoints.some(cp => cp.actualDate && cp.plannedDate && new Date(cp.actualDate) > new Date(cp.plannedDate));
        if (hasDelay) newStatus = 'delayed';
      }

      const { error } = await supabase
        .from('shipments')
        .update({
          checkpoints: updatedCheckpoints,
          status: newStatus
        })
        .eq('id', selectedShipment.id);

      if (error) throw error;

      setSelectedShipment({ ...selectedShipment, checkpoints: updatedCheckpoints, status: newStatus });
      setShowStatusModal(false);
      await fetchShipments();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'home') setView('home');
    if (tab === 'dashboard' || tab === 'shipments') setView('dashboard');
    if (tab === 'reports') setView('reports');
    if (tab === 'settings') setView('settings');
    if (tab === 'payments') setView('payments');
    if (tab === 'docs') setView('docs');
  };

  if (!session) {
    return <Login onLogin={setSession} />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-semibold text-sm">Carregando perfil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      <Header activeTab={activeTab} onTabChange={handleTabChange} profile={profile} permissions={permissions} />

      <main className="flex-1 w-full bg-[#fafafa] flex overflow-hidden max-h-[calc(100vh-64px)]">
        {/* GLOBAL LEFT MENU */}
        <div 
          className={`${isMenuExpanded ? 'w-64' : 'w-20'} transition-all duration-300 ease-in-out bg-white border-r border-slate-100 shadow-[2px_0_15px_rgba(0,0,0,0.02)] flex flex-col items-center py-6 shrink-0 z-10 relative overflow-y-auto custom-scrollbar`}
        >
          <button 
            onClick={() => setIsMenuExpanded(!isMenuExpanded)}
            className="w-10 h-10 mb-8 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center hover:bg-orange-100 transition-colors cursor-pointer shrink-0"
          >
            <Package className="w-5 h-5" />
          </button>

          <div className="flex flex-col gap-2 w-full px-3">
            {modules.map((m) => {
              const locked = !hasAccess(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (!locked && !m.noClick) {
                      setView(m.id as any);
                      if (['dashboard', 'shipments', 'payments', 'reports', 'settings', 'fleet', 'routing', 'docs', 'fork-manager', 'daily-schedule'].includes(m.id)) {
                        setActiveTab(m.id === 'shipments' ? 'dashboard' : m.id);
                      } else {
                        setActiveTab('home');
                      }
                    }
                  }}
                  className={`flex items-center gap-4 w-full p-3 rounded-2xl transition-all cursor-pointer group hover:bg-slate-50
                    ${locked || m.noClick ? 'opacity-40 grayscale' : ''}`}
                >
                  <div className="flex items-center justify-center shrink-0 w-8 h-8 transition-transform group-hover:scale-110">
                    <m.icon className="w-5 h-5 text-slate-400 group-hover:text-orange-500 transition-colors" />
                  </div>
                  <AnimatePresence>
                    {isMenuExpanded && (
                      <motion.div 
                        initial={{ opacity: 0, width: 0 }} 
                        animate={{ opacity: 1, width: 'auto' }} 
                        exit={{ opacity: 0, width: 0 }}
                        className="flex flex-col items-start min-w-0 flex-1 whitespace-nowrap overflow-hidden"
                      >
                        <h3 className="text-sm font-semibold text-slate-700 truncate">{m.title}</h3>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              )
            })}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <MainPanel
                onNavigate={(v) => {
                  setView(v);
                  if (['dashboard', 'shipments', 'payments', 'reports', 'settings'].includes(v)) {
                    setActiveTab(v === 'shipments' ? 'dashboard' : v);
                  } else {
                    setActiveTab('home');
                  }
                }}
                profile={profile}
                permissions={permissions}
                shipments={shipments}
              />
            </motion.div>
          )}

          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {loading ? (
                <div className="flex items-center justify-center min-h-[400px]">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 font-medium">Loading shipments...</p>
                  </div>
                </div>
              ) : (
                <Dashboard
                  shipments={shipments}
                  onSelectShipment={handleSelectShipment}
                  onCreateNew={handleCreateNew}
                  onBack={() => setView('home')}
                />
              )}
            </motion.div>
          )}

          {view === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <CreateShipment
                onCancel={() => setView('dashboard')}
                onSave={handleSaveShipment}
              />
            </motion.div>
          )}

          {view === 'detail' && selectedShipment && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <ShipmentDetail
                shipment={selectedShipment}
                onBack={() => setView('dashboard')}
                onUpdateStatus={() => setShowStatusModal(true)}
                onDeleteShipment={handleDeleteShipment}
              />
            </motion.div>
          )}

          {view === 'pam' && (
            <motion.div key="pam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PamModule onBack={() => setView('home')} profile={profile} />
            </motion.div>
          )}

          {view === 'daily-schedule' && (
            <motion.div key="daily-schedule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <DailySchedulePanel onBack={() => setView('home')} profile={profile} />
            </motion.div>
          )}

          {view === 'freight-calc' && (
            <motion.div key="freight" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <FreightCalc onBack={() => setView('home')} />
            </motion.div>
          )}

          {view === 'cargo-fit' && (
            <motion.div key="cargofit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CargoFit onBack={() => setView('home')} />
            </motion.div>
          )}

          {view === 'fork-manager' && (
            <motion.div key="fork" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ForkManager onBack={() => setView('home')} />
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SettingsPanel onBack={() => setView('home')} currentUser={profile} />
            </motion.div>
          )}

          {view === 'payments' && (
            <motion.div key="payments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PaymentsPanel onBack={() => setView('home')} profile={profile} />
            </motion.div>
          )}

          {view === 'docs' && (
            <motion.div key="docs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DocsPanel onBack={() => setView('home')} profile={profile} />
            </motion.div>
          )}
          {view === 'reports' && (
            <motion.div key="reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h1 className="text-3xl font-bold mb-4">Reports & BI</h1>
                <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center">
                  <BarChart3 className="w-16 h-16 text-slate-300 mb-4" />
                  <p className="text-slate-500 font-medium">Analytics dashboard is being synchronized...</p>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'routing' && (
            <motion.div key="routing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <RoutingPanel onBack={() => setView('home')} />
            </motion.div>
          )}

          {view === 'fleet' && (
            <motion.div key="fleet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <FleetRegistrationPanel onBack={() => setView('home')} profile={profile} />
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        {/* Global Right Pam Chat Menu */}
        <div 
          className={`${isRightMenuExpanded ? 'w-[340px]' : 'w-0'} transition-all duration-300 ease-in-out bg-white border-l border-slate-100 shadow-[-2px_0_15px_rgba(0,0,0,0.02)] flex flex-col shrink-0 z-40 relative overflow-hidden`}
        >
          <div className="w-[340px] flex flex-col h-full right-0">
            <div className="px-5 py-4 bg-white border-b border-slate-100 flex items-center gap-3 relative shrink-0">
              <div className="w-8 h-8 rounded-[12px] bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white shadow-sm">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold tracking-tight text-slate-800">Pam</p>
                <p className="text-[10px] text-slate-400 font-medium tracking-widest uppercase">Assistente Rápida</p>
              </div>
              <button onClick={() => setIsRightMenuExpanded(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar text-xs bg-[#fafafa]">
              {chatHistory.map((c, i) => (
                <div key={i} className={`flex gap-3 ${c.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                  {c.role === 'ai' && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5">
                      <Sparkles className="w-3 h-3" />
                    </div>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] leading-relaxed shadow-sm font-medium ${c.role === 'ai' ? 'bg-white border border-slate-100 text-slate-700 rounded-tl-none' : 'bg-slate-800 text-white rounded-tr-none'}`}>
                    {c.msg}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChat} className="p-3 bg-white border-t border-slate-100 flex gap-2 shrink-0">
               <input
                 value={chatMsg}
                 onChange={e => setChatMsg(e.target.value)}
                 placeholder="Perguntar à Pam..."
                 className="flex-1 bg-slate-100 text-xs font-medium outline-none rounded-xl px-4 py-2 text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500/30 transition-shadow"
               />
               <button disabled={!chatMsg.trim()} type="submit" className="w-9 h-9 shrink-0 rounded-xl bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm active:scale-95 cursor-pointer">
                 <Send className="w-3 h-3 ml-0.5" />
               </button>
            </form>
          </div>
        </div>

        {showStatusModal && selectedShipment && (
          <StatusUpdateModal
            shipment={selectedShipment}
            onClose={() => setShowStatusModal(false)}
            onUpdate={handleUpdateStatus}
          />
        )}
      
        <div className="fixed bottom-6 right-6 z-50">
          <button 
            onClick={() => setIsRightMenuExpanded(!isRightMenuExpanded)}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-all duration-300 shadow-[0_8px_20px_rgba(249,115,22,0.4)] active:scale-95 cursor-pointer ${isRightMenuExpanded ? 'bg-slate-800 shadow-[0_8px_20px_rgba(0,0,0,0.2)] hover:bg-slate-700' : 'bg-gradient-to-r from-orange-500 to-rose-500 hover:scale-105'}`}
          >
            {isRightMenuExpanded ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
          </button>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-slate-200 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 opacity-50">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">ISO 9001 Certified Logistics Platform</span>
          </div>
          <p className="text-xs text-slate-400 font-medium">© 2026 CargoTrack Logistics. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
