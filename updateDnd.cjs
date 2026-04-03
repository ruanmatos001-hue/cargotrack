const fs = require('fs');
const path = 'c:/Users/ruanm/Desktop/Doc/cargotrack/cargotrack/src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

const updatedPanel = `const DailySchedulePanel = ({ onBack }: { onBack: () => void }) => {
  const [columns, setColumns] = useState([
    {
      id: 'today',
      title: 'Hoje',
      cards: [
        { id: 44921, carrier: 'Swift Logistics S.A.', client: 'Atacadão Central', volumetry: '28.5 m³', labeled: true, inYard: true, separated: true, loaded: false, released: false, status: 'LIBERADO: AGUARDANDO DOCS', alert: false },
        { id: 45012, carrier: 'TransGlobal Brasil', client: 'Pharma Solutions', volumetry: '12.0 m³', labeled: true, inYard: false, separated: true, loaded: false, released: false, status: '', alert: true }
      ]
    },
    {
      id: 'tomorrow',
      title: '04.04',
      cards: [
        { id: 45089, carrier: 'Veloz Logística', client: 'SuperMercado X', volumetry: '45.2 m³', labeled: true, inYard: false, separated: false, loaded: false, released: false, status: 'AGUARDANDO INÍCIO', isTimeStatus: true, alert: false }
      ]
    },
    {
      id: 'dayAfter',
      title: '05.04',
      cards: [
        { id: 45122, carrier: 'Rodoviário Express', client: 'Build-It Ltda', volumetry: '18.0 m³', labeled: true, alert: false }
      ]
    }
  ]);

  const [draggedCard, setDraggedCard] = useState<{ colId: string, cardId: number } | null>(null);

  const handleDragStart = (e: React.DragEvent, colId: string, cardId: number) => {
    setDraggedCard({ colId, cardId });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    if (!draggedCard) return;

    if (draggedCard.colId === targetColId) {
      setDraggedCard(null);
      return; 
    }

    setColumns(prev => {
      const sourceCol = prev.find(c => c.id === draggedCard.colId);
      const targetCol = prev.find(c => c.id === targetColId);
      if (!sourceCol || !targetCol) return prev;

      const card = sourceCol.cards.find(c => c.id === draggedCard.cardId);
      if (!card) return prev;

      return prev.map(c => {
        if (c.id === draggedCard.colId) {
          return { ...c, cards: c.cards.filter(ca => ca.id !== draggedCard.cardId) };
        }
        if (c.id === targetColId) {
          return { ...c, cards: [...c.cards, card] };
        }
        return c;
      });
    });
    setDraggedCard(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-64px)] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-8 pb-6 shrink-0">
        <div className="flex items-start gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors mt-1">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Programação Diária de Carregamento</h1>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-slate-400" /> Status atualizado em tempo real para o terminal central.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-bold text-sm hover:bg-blue-100 transition-colors">
            <Filter className="w-4 h-4" /> Filtrar
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm shadow-md shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95">
            <Plus className="w-4 h-4" /> Nova Carga
          </button>
        </div>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-8 flex-1 custom-scrollbar min-h-0">
        {columns.map(col => (
          <div 
            key={col.id} 
            className={\`w-[360px] shrink-0 flex flex-col bg-slate-50/60 rounded-2xl border transition-colors \${draggedCard && draggedCard.colId !== col.id ? 'border-dashed border-blue-400/60 bg-blue-50/30' : 'border-blue-50/50'} overflow-hidden\`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            <div className="p-4 flex items-center justify-between bg-blue-50/40">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-blue-900 text-base tracking-tight">{col.title}</span>
                <span className="bg-white text-blue-600 shadow-sm text-xs px-2 py-0.5 rounded-full font-bold">{col.cards.length}</span>
              </div>
              <button className="text-slate-400 hover:text-blue-600 transition-colors"><MoreVertical className="w-5 h-5" /></button>
            </div>
            <div className="p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1 content-start">
              {col.cards.map(card => (
                <div 
                  key={card.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, col.id, card.id)}
                  className={\`bg-white rounded-[20px] p-5 border-l-4 shadow-sm hover:shadow-md transition-all relative cursor-grab active:cursor-grabbing \${card.alert ? 'border-l-red-500 border border-rose-100' : 'border-l-blue-600 border border-slate-100'}\`}
                >
                  {card.alert && <AlertTriangle className="w-5 h-5 text-red-500 absolute top-4 right-4" />}
                  
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {card.id}</span>
                    {!card.alert && <Truck className="w-4 h-4 text-slate-400" />}
                  </div>
                  
                  <h3 className="font-bold text-blue-900 text-base mb-1 pr-6">{card.carrier}</h3>
                  <p className="text-sm text-slate-500 mb-1">Cliente: {card.client}</p>
                  <p className="text-xs text-blue-600 font-bold mb-4">Volumetria: {card.volumetry}</p>
                  
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {card.labeled !== undefined && (
                      <div className={\`px-2 py-1.5 rounded-lg flex items-center gap-1.5 text-[9px] font-bold uppercase \${card.labeled ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}\`}>
                         {card.labeled ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />} Etiquetada
                      </div>
                    )}
                    {card.inYard !== undefined && (
                      <div className={\`px-2 py-1.5 rounded-lg flex items-center gap-1.5 text-[9px] font-bold uppercase \${card.inYard ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}\`}>
                         {card.inYard ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />} No Pátio
                      </div>
                    )}
                    {card.separated !== undefined && (
                      <div className={\`px-2 py-1.5 rounded-lg flex items-center gap-1.5 text-[9px] font-bold uppercase \${card.separated ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}\`}>
                         {card.separated ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />} Separado
                      </div>
                    )}
                    {card.loaded !== undefined && (
                       <div className={\`px-2 py-1.5 rounded-lg flex items-center gap-1.5 text-[9px] font-bold uppercase \${card.loaded ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}\`}>
                          {card.loaded ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />} Carregado
                       </div>
                    )}
                  </div>
                  
                  {card.status && (
                    <div className="mt-2 bg-slate-50 border border-slate-100 w-full py-2.5 px-3 rounded-lg flex items-center gap-2">
                       {card.isTimeStatus ? <Clock className="w-3.5 h-3.5 text-slate-400" /> : <Box className="w-3.5 h-3.5 text-slate-400" />}
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{card.status}</span>
                    </div>
                  )}
                </div>
              ))}
              {col.cards.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
                  <p className="text-sm font-medium text-center">Arraste cards para cá</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};`;

const startIndex = content.indexOf('const DailySchedulePanel =');
const endIndex = content.indexOf('const Dashboard =', startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    content = content.substring(0, startIndex) + updatedPanel + '\n\n' + content.substring(endIndex);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Successfully updated DailySchedulePanel with Drag & Drop.');
} else {
    console.error('Could not locate the component boundaries.');
}
