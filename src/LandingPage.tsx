import React from 'react';
import { motion } from 'motion/react';
import { 
  ArrowRight, ShieldCheck, Truck, Zap, BarChart3, Package, Calendar, Settings, CreditCard, MessageSquare, Route, Smartphone, CheckCircle2, ChevronRight
} from 'lucide-react';

export default function LandingPage({ onLoginClick }: { onLoginClick: () => void }) {
  const WHATSAPP_LINK = "https://wa.me/5592988098642?text=Ol%C3%A1%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20CargoTrack%20para%20minha%20empresa.";

  const fadeIn = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-orange-100 selection:text-orange-900 overflow-x-hidden text-slate-900">
      {/* Navbar */}
      <nav className="fixed w-full z-50 bg-white/90 backdrop-blur-xl border-b border-slate-200 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 p-2 rounded-xl shadow-sm shadow-orange-500/20">
              <Package className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">Cargo<span className="text-orange-500">Track</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#solucoes" className="text-sm font-semibold text-slate-500 hover:text-orange-600 transition-colors">Módulos</a>
            <a href="#pam" className="text-sm font-semibold text-slate-500 hover:text-orange-600 transition-colors">Inteligência Artificial</a>
            <a href="#beneficios" className="text-sm font-semibold text-slate-500 hover:text-orange-600 transition-colors">Benefícios</a>
          </div>
          <div className="flex items-center gap-3">
            <a 
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noreferrer"
              className="hidden lg:flex items-center gap-2 px-5 py-2.5 text-slate-600 text-sm font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:text-orange-600 transition-all active:scale-95"
            >
              Falar com Especialista
            </a>
            <button 
              onClick={onLoginClick}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-orange-600/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              Acessar
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-white">
        {/* Subtle background elements */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-slate-50/50 transform skew-x-[-15deg] translate-x-32" />
        <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-orange-100/50 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeIn}
              className="text-left"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-100 text-orange-600 text-xs font-bold uppercase tracking-widest mb-6 shadow-sm">
                Gestão Logística B2B Avançada
              </div>
              <h1 className="text-5xl lg:text-7xl font-black tracking-tight mb-8 leading-[1.1] text-slate-900">
                A Plataforma <br />
                <span className="text-orange-600">
                  Definitiva
                </span> para <br /> Cadeias de Suprimentos
              </h1>
              <p className="text-lg text-slate-600 max-w-xl mb-10 leading-relaxed font-medium">
                Conecte toda sua operação logística em uma central única. 
                De visibilidade de trânsito à gestão de equipamentos, oferecemos tecnologia enterprise para empresas que não aceitam ineficiências.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4 border-l-4 border-orange-500 pl-4 py-2">
                <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer" className="w-full sm:w-auto px-8 py-4 bg-orange-600 text-white rounded-xl font-bold text-base shadow-xl shadow-orange-600/20 hover:bg-orange-700 hover:scale-[1.02] active:scale-95 transition-all text-center">
                  Consultoria Gratuita
                </a>
                <button onClick={onLoginClick} className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 hover:border-orange-500 hover:text-orange-600 rounded-xl font-bold text-base transition-all active:scale-95">
                  Fazer Login <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="relative hidden lg:block"
            >
              <div className="relative rounded-3xl p-2 bg-white border border-slate-200 shadow-2xl shadow-slate-200/50 overflow-hidden transform rotate-2 hover:rotate-0 transition-transform duration-500">
                <div className="w-full h-[450px] bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 flex flex-col">
                  {/* Mockup Topbar */}
                  <div className="h-12 border-b border-slate-200 flex items-center px-4 gap-4 bg-white">
                    <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-rose-400" /><div className="w-3 h-3 rounded-full bg-amber-400" /><div className="w-3 h-3 rounded-full bg-emerald-400" /></div>
                    <div className="flex-1 bg-slate-100 h-6 rounded-md"></div>
                  </div>
                  {/* Mockup Content */}
                  <div className="flex-1 p-6 relative">
                    <div className="flex justify-between items-center mb-6">
                      <div className="w-48 h-6 bg-slate-200 rounded-md"></div>
                      <div className="w-24 h-6 bg-orange-100 rounded-full"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="h-24 bg-white border border-slate-100 rounded-xl shadow-sm p-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 mb-2"></div>
                        <div className="w-20 h-4 bg-slate-200 rounded mb-2"></div>
                        <div className="w-12 h-6 bg-slate-800 rounded"></div>
                      </div>
                      <div className="h-24 bg-white border border-slate-100 rounded-xl shadow-sm p-4">
                        <div className="w-8 h-8 rounded-full bg-orange-100 mb-2"></div>
                        <div className="w-20 h-4 bg-slate-200 rounded mb-2"></div>
                        <div className="w-12 h-6 bg-orange-600 rounded"></div>
                      </div>
                    </div>
                    <div className="h-40 bg-white border border-slate-100 rounded-xl shadow-sm p-4 flex gap-4">
                       <div className="w-12 h-full bg-slate-100 rounded-lg"></div>
                       <div className="flex-1 space-y-3 pt-2">
                         <div className="w-full h-3 bg-slate-100 rounded-full"></div>
                         <div className="w-[80%] h-3 bg-slate-100 rounded-full"></div>
                         <div className="w-[90%] h-3 bg-slate-100 rounded-full"></div>
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Modules Grid */}
      <section id="solucoes" className="py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div 
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeIn}
            className="text-center mb-20"
          >
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 mb-4 tracking-tight">Um Ecossistema Completo</h2>
            <p className="text-slate-500 font-medium max-w-2xl mx-auto text-lg leading-relaxed">
              Integramos os dados mais complexos da sua operação diária em fluxos limpos e decisões baseadas em painéis gerenciais focados no longo prazo.
            </p>
          </motion.div>

          <motion.div 
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* Planejamento Kanban */}
            <motion.div variants={fadeIn} className="bg-white border border-slate-200 p-10 rounded-[2rem] hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
              <div className="w-14 h-14 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Planejamento Diário (Kanban)</h3>
              <p className="text-slate-600 text-base leading-relaxed">
                Organize sua programação de cais de carregamento visualmente. Mova agendamentos, visualize status de frota "no pátio" ou "carregando" arrastando cards rapidamente para garantir o SLA de expedição.
              </p>
            </motion.div>

            {/* Tracking de Trânsito */}
            <motion.div variants={fadeIn} className="bg-white border border-slate-200 p-10 rounded-[2rem] hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Route className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Gestão de Trânsito & Tracking</h3>
              <p className="text-slate-600 text-base leading-relaxed">
                Navegue pelas suas cargas fracionadas, modais aéreo, rodoviário, fluvial ou cabotagem. Checkpoints de previsibilidade de atrasos (delay alerts) e KPIs de visibilidade ponta a ponta.
              </p>
            </motion.div>

            {/* Custos e Pagamentos */}
            <motion.div variants={fadeIn} className="bg-white border border-slate-200 p-10 rounded-[2rem] hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
              <div className="w-14 h-14 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <CreditCard className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Faturamento e Custos</h3>
              <p className="text-slate-600 text-base leading-relaxed">
                Conciliação das faturas por transportadora comparando a provisão e a fatura final. Crie relatórios gerenciais que protegem o DRE da empresa contra estouro de orçamento por frete extra.
              </p>
            </motion.div>

            {/* Gestão de Equipamentos */}
            <motion.div variants={fadeIn} className="bg-white border border-slate-200 p-10 rounded-[2rem] hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
              <div className="w-14 h-14 bg-orange-50 border border-orange-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Settings className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">ForkManager (Manutenção)</h3>
              <p className="text-slate-600 text-base leading-relaxed">
                Seus equipamentos, como empilhadeiras e transpaleteiras, com horas controladas, alertas de revisões preventivas para assegurar que a o pátio nunca fique paralisado.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* AI Section: PAM */}
      <section id="pam" className="py-24 bg-slate-900 relative overflow-hidden">
        {/* Abstract Backgrounds */}
        <div className="absolute top-0 right-0 w-3/4 h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/10 via-slate-900 to-slate-900" />
        <div className="absolute bottom-0 left-0 w-1/2 h-full bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-500/10 via-slate-900 to-slate-900" />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}
              className="order-2 lg:order-1"
            >
              <div className="w-full max-w-lg mx-auto lg:mx-0 bg-slate-800 border border-slate-700/50 rounded-3xl p-6 shadow-2xl relative">
                {/* Chat header */}
                <div className="flex items-center gap-4 border-b border-slate-700 pb-4 mb-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg transform rotate-[-5deg]">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-lg">Pamela (Pam)</h4>
                    <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> Online e analisando
                    </span>
                  </div>
                </div>
                {/* Chat flow */}
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <div className="bg-slate-700 text-slate-100 rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-[85%] font-medium">
                      Pam, quais carretas estão em risco de atrasar o cross-docking amanhã?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-orange-500/10 border border-orange-500/20 text-orange-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm max-w-[85%] leading-relaxed font-medium">
                      Analisei os horários de Doca. As Placas <span className="font-bold text-orange-400">XYZ-1234</span> e <span className="font-bold text-orange-400">ABC-9876</span> da modalidade lotação registram atraso de pista em Rondonópolis. Estimativa ajustada: +4hrs. Deseja que eu notifique o fiscal?
                    </div>
                  </div>
                </div>
                <div className="mt-6 mx-2 bg-slate-900 border border-slate-700 rounded-full px-4 py-3 flex justify-between items-center opacity-50">
                  <span className="text-slate-500 text-xs">Pergunte aos seus dados logísticos...</span>
                  <MessageSquare className="w-4 h-4 text-slate-500" />
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}
              className="order-1 lg:order-2"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-orange-400 text-xs font-bold uppercase tracking-widest mb-6">
                Machine Learning Integrado
              </div>
              <h2 className="text-4xl lg:text-5xl font-black text-white mb-6 tracking-tight">
                Pam:<br />Sua Inteligência <span className="text-orange-500 block mt-2">Logística Artificial</span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-8">
                Tome decisões baseadas em insights automáticos. A Pam lê todos os dados da plataforma, correlaciona rotas, prevê gargalos de trânsito em tempo real e analisa contratos de custos instantaneamente enquanto você simplesmente conversa com ela.
              </p>
              <ul className="space-y-4">
                {[
                  "Alerta proativo de atrasos operacionais via machine learning",
                  "Consolidação de dados rápidos sobre as finanças de fretes via chat",
                  "Suporte 24/7 integrado aos módulos do CargoTrack"
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-orange-500 shrink-0" />
                    <span className="text-slate-200 font-semibold">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Layer */}
      <section className="py-24 relative overflow-hidden bg-white border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-8 tracking-tight">Assuma a liderança da sua cadeia logística</h2>
          <p className="text-slate-600 text-lg md:text-xl mb-12 font-medium">
            Agende uma demonstração focada nos problemas técnicos e departamentais da sua empresa com nosso arquiteto de supply chain.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a 
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noreferrer"
              className="px-10 py-5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-lg shadow-xl shadow-orange-600/20 active:scale-95 transition-all text-center flex justify-center items-center gap-2"
            >
              <Smartphone className="w-5 h-5" /> Falar com Especialista
            </a>
            <button 
              onClick={onLoginClick}
              className="px-10 py-5 bg-white border-2 border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50 rounded-xl font-bold text-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              Fazer Login <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-12 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-3">
            <Package className="w-6 h-6 text-orange-500" />
            <span className="text-xl font-bold text-slate-900 tracking-tight">Cargo<span className="text-orange-500">Track</span></span>
          </div>
          <p className="text-slate-500 font-medium text-sm">
            © 2026 CargoTrack Enterprise Systems B2B. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
