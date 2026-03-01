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
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type TransportMode = 'Road' | 'Maritime' | 'Air' | 'Express';
type ShipmentStatus = 'on-route' | 'delayed' | 'pending' | 'loading';

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
}

interface Payment {
  id: string;
  company_id: string;
  type: 'monthly' | 'extra';
  document_type: 'NF' | 'ND';
  document_number?: string;
  amount: number;
  description: string;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue';
  paid_at?: string;
  created_at: string;
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
            <div className="bg-blue-600 p-1.5 rounded-lg group-hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">
              <Package className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">CargoTrack</span>
          </div>
          <nav className="hidden md:flex space-x-8">
            {['Dashboard', 'Shipments', 'Payments', 'Reports', 'Settings'].map((tab) => {
              if (tab === 'Settings' && profile?.role !== 'super-admin' && profile?.role !== 'company-admin') return null;
              if (tab === 'Payments' && profile?.role !== 'super-admin' && profile?.role !== 'company-admin' && !permissions.some(p => p.module_id === 'payments')) return null;
              return (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab.toLowerCase())}
                  className={`text-sm font-medium transition-colors relative py-5 ${activeTab === tab.toLowerCase() ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
                    }`}
                >
                  {tab}
                  {activeTab === tab.toLowerCase() && (
                    <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
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

const MainPanel = ({ onNavigate, profile, permissions }: { onNavigate: (view: any) => void, profile: Profile | null, permissions: ModuleAccess[] }) => {
  const modules = [
    { id: 'dashboard', title: 'Shipments', desc: 'Real-time tracking & delay alerts', icon: Truck, color: 'bg-blue-600', status: 'Active' },
    { id: 'freight-calc', title: 'FreightCalc', desc: 'Simulator & performance ranking', icon: Calculator, color: 'bg-emerald-600', status: 'Beta' },
    { id: 'cargo-fit', title: 'CargoFit', desc: 'Trailer occupation & optimization', icon: Box, color: 'bg-amber-600', status: 'Coming Soon' },
    { id: 'fork-manager', title: 'ForkManager', desc: 'Fleet maintenance & OS control', icon: Zap, color: 'bg-orange-600', status: 'Coming Soon' },
    { id: 'payments', title: 'Payments', desc: 'Invoices, slips & financial management', icon: CreditCard, color: 'bg-rose-600', status: 'New' },
    { id: 'docs', title: 'Documents', desc: 'ISO, SGI, ASO & contract tracking', icon: ShieldCheck, color: 'bg-cyan-600', status: 'New' },
  ];

  const hasAccess = (modId: string) => {
    if (profile?.role === 'super-admin') return true;
    return permissions.some(p => p.module_id === modId);
  };

  const getPermType = (modId: string) => {
    if (profile?.role === 'super-admin') return 'edit';
    return permissions.find(p => p.module_id === modId)?.permission_type || null;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">CargoTrack <span className="text-blue-600">Pro</span></h1>
          <p className="text-slate-500 mt-2 text-lg">Integrated Logistics Suite for Modern Supply Chain Management.</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-xl text-blue-700 font-bold text-xs">
          <ShieldCheck className="w-4 h-4" /> Global Control Enabled ({profile?.role})
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((m) => {
          const locked = !hasAccess(m.id);
          const permType = getPermType(m.id);

          return (
            <motion.div
              key={m.id}
              whileHover={!locked ? { y: -5, scale: 1.01 } : {}}
              onClick={() => !locked && onNavigate(m.id)}
              className={`bg-white rounded-2xl p-6 border border-slate-200 shadow-sm transition-all relative overflow-hidden group 
              ${locked ? 'cursor-not-allowed grayscale' : 'cursor-pointer hover:shadow-lg hover:border-blue-100'} 
              flex items-center gap-6 h-32`}
            >
              <div className={`w-16 h-16 shrink-0 ${locked ? 'bg-slate-200' : m.color} rounded-xl flex items-center justify-center shadow-md transition-transform ${!locked && 'group-hover:scale-110'}`}>
                <m.icon className={`w-8 h-8 ${locked ? 'text-slate-400' : 'text-white'}`} />
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold text-slate-900">{m.title}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest ${locked ? 'bg-slate-100 text-slate-400' :
                    m.status === 'Active' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                    {locked ? 'Locked' : m.status}
                  </span>
                </div>
                <p className="text-slate-500 text-xs leading-tight line-clamp-2">{m.desc}</p>
                {permType && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${permType === 'edit' ? 'bg-emerald-400' : 'bg-blue-400'}`}></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{permType} access</span>
                  </div>
                )}
              </div>

              {locked && (
                <div className="absolute inset-0 bg-slate-50/20 backdrop-blur-[1px] flex items-center justify-end pr-4 pointer-events-none">
                  <div className="bg-white/90 p-2 rounded-full shadow-sm border border-slate-100">
                    <Lock className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              )}

              {!locked && (
                <div className="absolute bottom-2 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="w-4 h-4 text-blue-500" />
                </div>
              )}
            </motion.div>
          );
        })}
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
                  {metrics.delayDays > 0 && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded uppercase border border-red-100 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> +{metrics.delayDays}d Delayed
                    </span>
                  )}
                  {metrics.delayDays === 0 && (
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
        { label: 'Total Managed', value: '1,482', color: 'text-slate-900' },
        { label: 'In Transit', value: '124', color: 'text-blue-600' },
        { label: 'Delays', value: '03', color: 'text-amber-600' },
        { label: 'Completed Today', value: '18', color: 'text-emerald-600' },
      ].map((stat) => (
        <div key={stat.label} className="bg-white p-6 rounded-xl border border-slate-200">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{stat.label}</span>
          <span className={`text-3xl font-bold ${stat.color}`}>{stat.value}</span>
        </div>
      ))}
    </div>
  </div>
);

const CreateShipment = ({ onCancel, onSave }: { onCancel: () => void; onSave: (s: Shipment) => void }) => {
  const [mode, setMode] = useState<TransportMode>('Road');
  const [origin, setOrigin] = useState('Manaus (MAO)');
  const [destination, setDestination] = useState('Extrema (MG)');
  const [departureDate, setDepartureDate] = useState('2026-02-25');
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setInvoiceFile(e.target.files[0]);
    }
  };

  const carriers = [
    'LLS ESSENCIAL TRANSPORTES',
    'MVM TRANPOSRTES',
    'TRAGETTA - FL BRASIL',
    'BERTOLINI TRANPOSRTES LTDA'
  ];

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
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Carrier Service</label>
                  <select
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select Carrier...</option>
                    {carriers.map(c => <option key={c} value={c}>{c}</option>)}
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
                    accept=".xlsx,.xls,.pdf"
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

          <div className="bg-slate-900 rounded-2xl p-6 text-white overflow-hidden relative">
            <div className="relative z-10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Active Route</span>
              <h3 className="font-bold text-lg">MAO Hub → Extrema Hub</h3>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-20">
              <Truck className="w-24 h-24" />
            </div>
          </div>
        </div>
      </div >
    </div >
  );
};

const ShipmentDetail = ({
  shipment,
  onBack,
  onUpdateStatus
}: {
  shipment: Shipment;
  onBack: () => void;
  onUpdateStatus: () => void;
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
            <span className="text-blue-600">{shipment.code}</span>
          </nav>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-slate-900">{shipment.code}</h1>
            <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full border border-blue-100 uppercase tracking-wider">
              {shipment.mode}
            </span>
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
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          email: newUserEmail,
          role: newUserRole,
          company_id: currentUser?.company_id || null,
        })
        .select()
        .single();

      if (error) throw error;

      alert(`Invitation for ${newUserEmail} created successfully! The user can now register and their profile will be linked.`);
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

  const [newPayment, setNewPayment] = useState({
    type: 'monthly',
    document_type: 'NF',
    document_number: '',
    amount: '',
    description: '',
    due_date: new Date().toISOString().split('T')[0]
  });

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
    if (!profile?.company_id) {
      alert('Company ID not found in profile.');
      return;
    }
    try {
      const { error } = await supabase.from('payments').insert([{
        type: newPayment.type,
        document_type: newPayment.document_type,
        document_number: newPayment.document_number,
        amount: parseFloat(newPayment.amount),
        description: newPayment.description,
        due_date: newPayment.due_date,
        company_id: profile.company_id,
        status: 'pending'
      }]);
      if (error) throw error;
      setShowCreateModal(false);
      fetchPayments();
      setNewPayment({
        type: 'monthly',
        document_type: 'NF',
        document_number: '',
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
      const { error } = await supabase
        .from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      fetchPayments();
    } catch (err) {
      alert('Error updating status');
    }
  };

  const getStatusDetails = (payment: Payment) => {
    if (payment.status === 'paid') return { label: 'Paid', color: 'bg-emerald-100 text-emerald-600', icon: CheckCircle2 };

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
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Document</th>
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
                          <p className="text-sm font-bold text-slate-900">{p.document_type} {p.document_number || '---'}</p>
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
                      {p.status === 'pending' && (
                        <button
                          onClick={() => markAsPaid(p.id)}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase hover:bg-emerald-100 transition-colors"
                        >
                          Mark as Paid
                        </button>
                      )}
                      {p.status === 'paid' && (
                        <div className="text-[10px] text-slate-400 font-medium">
                          Paid on {new Date(p.paid_at!).toLocaleDateString('pt-BR')}
                        </div>
                      )}
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
  const [view, setView] = useState<'home' | 'dashboard' | 'create' | 'detail' | 'freight-calc' | 'cargo-fit' | 'reports' | 'fork-manager' | 'settings' | 'payments' | 'docs'>('home');
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
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false });

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
          invoice_file_name: s.invoiceFileName
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

  const handleUpdateStatus = async (updatedCheckpoints: Checkpoint[]) => {
    if (!selectedShipment) return;

    try {
      // Determine overall status
      let newStatus: ShipmentStatus = 'on-route';
      const hasDelay = updatedCheckpoints.some(cp => cp.actualDate && cp.plannedDate && new Date(cp.actualDate) > new Date(cp.plannedDate));
      if (hasDelay) newStatus = 'delayed';

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
  };

  if (!session) {
    return <Login onLogin={setSession} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      <Header activeTab={activeTab} onTabChange={handleTabChange} profile={profile} permissions={permissions} />

      <main>
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
              />
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
        </AnimatePresence>

        {showStatusModal && selectedShipment && (
          <StatusUpdateModal
            shipment={selectedShipment}
            onClose={() => setShowStatusModal(false)}
            onUpdate={handleUpdateStatus}
          />
        )}
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
