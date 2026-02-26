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
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type TransportMode = 'Road' | 'Maritime' | 'Air' | 'Express';
type ShipmentStatus = 'on-route' | 'delayed' | 'pending' | 'loading';

interface Checkpoint {
  id: string;
  label: string;
  status: 'pending' | 'completed' | 'current';
  timestamp?: string; // Actual time
  location?: string;
  details?: string;
  plannedDate?: string;
  actualDate?: string;
  duration?: number; // Days
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
  shipment.checkpoints.forEach(cp => {
    if (cp.actualDate) {
      const d = new Date(cp.actualDate);
      if (d > lastCompletedDate) lastCompletedDate = d;
    }
  });

  const isCompleted = shipment.checkpoints.every(cp => cp.status === 'completed');
  const referenceDate = isCompleted ? lastCompletedDate : today;
  const currentTransitTime = Math.max(0, Math.ceil((referenceDate.getTime() - departureDate.getTime()) / (24 * 60 * 60 * 1000)));

  // 2. Delay Days Calculation
  let totalDelayDays = 0;
  shipment.checkpoints.forEach(cp => {
    if (cp.actualDate && cp.plannedDate) {
      const diff = Math.ceil((new Date(cp.actualDate).getTime() - new Date(cp.plannedDate).getTime()) / (24 * 60 * 60 * 1000));
      if (diff > 0) totalDelayDays = Math.max(totalDelayDays, diff); // Use the max delay encountered so far as the current drift
    } else if (!cp.actualDate && cp.plannedDate) {
      const overdue = Math.ceil((today.getTime() - new Date(cp.plannedDate).getTime()) / (24 * 60 * 60 * 1000));
      if (overdue > 0) totalDelayDays = Math.max(totalDelayDays, overdue);
    }
  });

  // 3. Estimated Arrival
  const finalCheckpoint = shipment.checkpoints[shipment.checkpoints.length - 1];
  const originalArrival = new Date(finalCheckpoint.plannedDate || shipment.departureDate);
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

const INITIAL_SHIPMENTS: Shipment[] = [
  {
    id: '1',
    code: 'OKA-2026-0142',
    mode: 'Maritime',
    origin: 'Manaus (MAO)',
    destination: 'Extrema (MG)',
    status: 'delayed',
    leadTime: 21,
    currentTransitTime: 18,
    departureDate: '2026-02-07',
    carrier: 'Aliança Arpoador - Cabotagem',
    cargoType: 'Lotação',
    cargoDescription: 'Electronics Components',
    value: 'R$ 450.000,00',
    plate: 'CAB-9988',
    seals: 'S-001, S-002',
    booking: 'B-112233',
    trackingTag: 'T-001',
    invoices: [
      { nf: 'NF-001242', value: '12.450,00' },
      { nf: 'NF-001243', value: '4.210,50' },
      { nf: 'NF-001268', value: '158.900,00' },
    ],
    checkpoints: [
      { id: 'c1', label: 'DeadLine Navio', status: 'completed', timestamp: '08:30 AM', location: 'Manaus, AM' },
      { id: 'c2', label: 'Saída Navio MAO', status: 'completed', timestamp: '02:15 PM', location: 'Manaus, AM' },
      { id: 'c3', label: 'Chegada Navio SSZ', status: 'current', details: 'In Transit - Sea' },
      { id: 'c4', label: 'Time Movimentação Porto', status: 'pending' },
      { id: 'c5', label: 'Chegada Cliente', status: 'pending' }
    ]
  },
  {
    id: '2',
    code: 'OKA-2026-0098',
    mode: 'Road',
    origin: 'Manaus (MAO)',
    destination: 'Extrema (MG)',
    status: 'on-route',
    leadTime: 16,
    currentTransitTime: 6,
    departureDate: '2026-02-19',
    carrier: 'Rodoviário - LogExpress',
    cargoType: 'Lotação',
    cargoDescription: 'Automotive Parts',
    value: 'R$ 210.000,00',
    plate: 'ROD-1122',
    seals: 'S-101',
    booking: 'BK-0098',
    trackingTag: 'TAG-98',
    invoices: [],
    checkpoints: [
      { id: 'c1', label: 'Saída MAO', status: 'completed', timestamp: '10:00 AM', location: 'Manaus, AM' },
      { id: 'c2', label: 'Chegada BEL', status: 'current', details: 'In Transit to Belém' },
      { id: 'c3', label: 'Saída BEL', status: 'pending' },
      { id: 'c4', label: 'Chegada Cliente', status: 'pending' }
    ]
  },
  {
    id: '3',
    code: 'OKA-2026-0201',
    mode: 'Air',
    origin: 'Manaus (MAO)',
    destination: 'Extrema (MG)',
    status: 'loading',
    leadTime: 5,
    currentTransitTime: 1,
    departureDate: '2026-02-24',
    carrier: 'Air Freight - Priority',
    cargoType: 'Fracionado',
    cargoDescription: 'Consumer Goods',
    value: 'R$ 120.000,00',
    plate: 'AIR-4455',
    seals: 'N/A',
    booking: 'B-2021',
    trackingTag: 'T-2021',
    invoices: [],
    checkpoints: [
      { id: 'c1', label: 'Saída MAO', status: 'current', details: 'Loading at Terminal' },
      { id: 'c2', label: 'Chegada GRU', status: 'pending' },
      { id: 'c3', label: 'Chegada Cliente', status: 'pending' }
    ]
  }
];

// --- Components ---

const Header = ({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) => (
  <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between h-16 items-center">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onTabChange('dashboard')}>
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">CargoTrack</span>
          </div>
          <nav className="hidden md:flex space-x-8">
            {['Dashboard', 'Shipments', 'Reports', 'Settings'].map((tab) => (
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
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative hidden sm:block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search ID..."
              className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm w-48 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
            />
          </div>
          <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </button>
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border border-slate-300">
            <img src="https://picsum.photos/seed/user/32/32" alt="User" referrerPolicy="no-referrer" />
          </div>
        </div>
      </div>
    </div>
  </header>
);

const Dashboard = ({ shipments, onSelectShipment, onCreateNew }: {
  shipments: Shipment[];
  onSelectShipment: (s: Shipment) => void;
  onCreateNew: () => void;
}) => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div className="flex justify-between items-end mb-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Active Shipments</h1>
        <p className="text-slate-500 mt-1">Monitoring {shipments.length} active logistics routes for Manaus-Southeast corridors.</p>
      </div>
      <div className="flex gap-3">
        <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
          <Filter className="w-4 h-4" />
          Filter
        </button>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
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

                  {shipment.checkpoints.map((cp, idx) => {
                    const isOverdue = isCheckpointDelayed(cp);
                    return (
                      <div key={cp.id} className="flex flex-col items-center gap-2 relative">
                        <div className={`w-4 h-4 rounded-full border-3 border-white shadow-md transition-all ${cp.status === 'completed' ? 'bg-emerald-500' :
                          isOverdue ? 'bg-red-500 animate-pulse ring-4 ring-red-100' :
                            cp.status === 'current' ? 'bg-blue-600 ring-2 ring-blue-100' : 'bg-slate-200'
                          }`} />
                        <span className={`text-[10px] font-bold uppercase tracking-tighter absolute -bottom-6 whitespace-nowrap ${isOverdue ? 'text-red-600 font-extrabold' :
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
        code: `OKA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
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
        <div className="ml-auto flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Download className="w-4 h-4" />
            Download All Docs
          </button>
          <button
            onClick={onUpdateStatus}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
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

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'dashboard' | 'create' | 'detail'>('dashboard');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);

  useEffect(() => {
    fetchShipments();
  }, []);

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

      setShipments(mappedShipments.length > 0 ? mappedShipments : INITIAL_SHIPMENTS);
    } catch (err) {
      console.error('Error fetching shipments:', err);
      setShipments(INITIAL_SHIPMENTS);
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

      if (error) throw error;

      await fetchShipments();
      setView('dashboard');
    } catch (err) {
      console.error('Error saving shipment:', err);
      // Fallback to local state if DB fails (optional)
      setShipments([s, ...shipments]);
      setView('dashboard');
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
    if (tab === 'dashboard' || tab === 'shipments') {
      setView('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      <Header activeTab={activeTab} onTabChange={handleTabChange} />

      <main>
        <AnimatePresence mode="wait">
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
