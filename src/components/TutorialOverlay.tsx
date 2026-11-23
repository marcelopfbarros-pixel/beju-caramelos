import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ScreenId } from './Sidebar';
import { ChevronLeft, ChevronRight, X, HelpCircle, CheckCircle2 } from 'lucide-react';

interface TutorialStep {
  title: string;
  description: string;
  findTarget: () => HTMLElement | null;
}

function findInMainByText(tagSelector: string, textIncludes: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`main ${tagSelector}`));
  const needle = textIncludes.toLowerCase();
  return nodes.find(el => (el.textContent || '').toLowerCase().includes(needle) && el.offsetParent !== null) || null;
}

function findVisible(selector: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return nodes.find(el => el.offsetParent !== null) || null;
}

const SCREEN_NAMES: Record<ScreenId, string> = {
  pedidos: 'Pedidos',
  producao: 'Produção',
  estoque: 'Estoque',
  entregas: 'Entregas',
  clientes: 'Clientes',
  produtos: 'Produtos',
  lojas: 'Unidades',
  configuracoes: 'Configurações',
  painel: 'Indicadores & Ferramentas',
};

const SCREEN_TUTORIALS: Record<ScreenId, TutorialStep[]> = {
  pedidos: [
    {
      title: 'Criar ou Importar Pedido',
      description: 'Use "+ Pedido" para registrar manualmente ou "Importar WhatsApp IA" para colar a mensagem do cliente.',
      findTarget: () => findInMainByText('button', 'Pedido'),
    },
    {
      title: 'Filtrar e Buscar Pedidos',
      description: 'Filtre por status, ordene, agrupe por loja/modalidade ou busque por número, cliente ou telefone.',
      findTarget: () => findVisible('main input[type="text"]'),
    },
    {
      title: 'Alterar Status com Confirmação',
      description: 'Use os botões < / > ou o seletor na coluna Status para avançar ou voltar o pedido (com confirmação).',
      findTarget: () => findVisible('main select[aria-label^="Alterar status"]') || findVisible('main table') || findVisible('main'),
    },
    {
      title: 'Resumo e Ferramentas no Painel',
      description: 'Clique em um pedido para abrir o resumo para WhatsApp e ferramentas rápidas na barra direita.',
      findTarget: () => findVisible('aside:last-of-type') || findVisible('main'),
    },
  ],
  producao: [
    {
      title: 'Registrar Produção Manual',
      description: 'Clique em "+ Produção" para agendar lotes extras ou antecipados por data, turno e loja destino.',
      findTarget: () => findInMainByText('button', 'Produção'),
    },
    {
      title: 'Filtrar Data e Turno',
      description: 'Alterne entre Hoje, Amanhã, Todas ou escolha uma data específica para organizar a cozinha.',
      findTarget: () => findInMainByText('button', 'Hoje') || findVisible('main input[type="date"]'),
    },
    {
      title: 'Alterar Estágio da Cozinha',
      description: 'Avance ou volte entre Planejada, Em Preparo e Concluída. Ao concluir, o estoque é atualizado.',
      findTarget: () => findVisible('main select[aria-label^="Estágio da cozinha"]') || findVisible('main table'),
    },
    {
      title: 'Planejamento Dinâmico na Barra Direita',
      description: 'Use a ferramenta "Planejamento de Produção" no painel direito para ver a tabela dinâmica por categoria.',
      findTarget: () => findVisible('aside:last-of-type') || findVisible('main'),
    },
  ],
  estoque: [
    {
      title: 'Lançar ou Ajustar Estoque',
      description: 'Clique em "+ Estoque" para cadastrar saldo inicial ou ajustar quantidades de produtos por unidade.',
      findTarget: () => findInMainByText('button', 'Estoque'),
    },
    {
      title: 'Filtrar por Nível de Alerta',
      description: 'Filtre rapidamente os itens em nível crítico (abaixo do mínimo) ou dentro da meta.',
      findTarget: () => findVisible('main select'),
    },
    {
      title: 'Acompanhar Saldos e Mínimos',
      description: 'Confira a quantidade atual, o mínimo configurado e o status de cada produto na unidade.',
      findTarget: () => findVisible('main table') || findVisible('main'),
    },
    {
      title: 'Movimentação Automática',
      description: 'Produções concluídas abastecem a Central/Lojas e pedidos entregues dão baixa automática.',
      findTarget: () => findVisible('header select'),
    },
  ],
  entregas: [
    {
      title: 'Selecionar Pedidos para Rota',
      description: 'Marque os checkboxes dos pedidos Pronto ou Em Rota para montar sua rota (entregues ficam bloqueados).',
      findTarget: () => findVisible('main input[type="checkbox"]') || findVisible('main'),
    },
    {
      title: 'Abrir Roteiro no Mapa',
      description: 'Clique em "Rota" para enviar as entregas selecionadas diretamente ao roteirizador na barra direita.',
      findTarget: () => findInMainByText('button', 'Rota'),
    },
    {
      title: 'Filtrar por Status e Data',
      description: 'Por padrão, pedidos já entregues ficam ocultos. Use o filtro Status para ver "Só entregues" ou "Sem filtro".',
      findTarget: () => findInMainByText('button', 'Hoje') || findVisible('main select'),
    },
    {
      title: 'Imprimir Etiquetas e Confirmar Entrega',
      description: 'Imprima comprovantes/etiquetas ou avance o status para Em Rota / Entregue com confirmação.',
      findTarget: () => findInMainByText('button', 'Etiqueta') || findInMainByText('button', 'Entrega') || findVisible('main'),
    },
  ],
  clientes: [
    {
      title: 'Cadastrar Novo Cliente',
      description: 'Clique em "+ Cliente" para adicionar nome, WhatsApp, endereço com busca por CEP e detalhe de entrega.',
      findTarget: () => findInMainByText('button', 'Cliente'),
    },
    {
      title: 'Buscar na Base',
      description: 'Pesquise rapidamente por nome, telefone ou endereço do cliente.',
      findTarget: () => findVisible('main input[type="text"]'),
    },
    {
      title: 'Histórico de Pedidos e Endereço',
      description: 'Veja a quantidade de pedidos realizados e o detalhe de entrega salvo de cada cliente.',
      findTarget: () => findVisible('main table') || findVisible('main'),
    },
  ],
  produtos: [
    {
      title: 'Cadastrar Novo Produto',
      description: 'Clique em "+ Produto" para definir SKU, preço com 2 casas decimais, unidade, categoria e foto local.',
      findTarget: () => findInMainByText('button', 'Produto'),
    },
    {
      title: 'Gerenciar Categorias',
      description: 'Use "Categorias" para criar novas categorias ou ativar/inativar categorias existentes.',
      findTarget: () => findInMainByText('button', 'Categorias'),
    },
    {
      title: 'Importar ou Exportar Planilha',
      description: 'Exporte o catálogo completo para Excel ou importe produtos em lote.',
      findTarget: () => findInMainByText('button', 'Exportar') || findVisible('main'),
    },
    {
      title: 'Alternar Grade e Tabela',
      description: 'Alterne entre visualização em cards ou tabela e filtre por categoria ou ordenação.',
      findTarget: () => findInMainByText('button', 'Grade') || findInMainByText('button', 'Tabela') || findVisible('main'),
    },
  ],
  lojas: [
    {
      title: 'Cadastrar Nova Unidade',
      description: 'Clique em "+ Unidade" para adicionar lojas/filiais com busca automática de endereço por CEP e PIX.',
      findTarget: () => findInMainByText('button', 'Unidade'),
    },
    {
      title: 'Gerenciar Inventário e Estoque Mínimo',
      description: 'Clique em "Inventário" no card da unidade para definir produtos oferecidos, saldo atual, mínimo e imprimir.',
      findTarget: () => findInMainByText('button', 'Inventário'),
    },
    {
      title: 'Criar Pedido Especial de Reposição',
      description: 'Clique em "Reposição" para gerar automaticamente um pedido ao ateliê com base no estoque abaixo do mínimo.',
      findTarget: () => findInMainByText('button', 'Reposição'),
    },
    {
      title: 'Monitorar "Produtos a repor"',
      description: 'Cada card exibe quantos produtos estão abaixo do estoque mínimo para ação rápida.',
      findTarget: () => findInMainByText('span', 'Produtos a repor') || findVisible('main'),
    },
  ],
  configuracoes: [
    {
      title: 'Navegar pelas Abas de Configuração',
      description: 'Alterne entre Perfil, Usuários, Unidades, Metas, WhatsApp, Cardápio e Dados.',
      findTarget: () => findInMainByText('button', 'Usuários') || findVisible('main'),
    },
    {
      title: 'Editar Perfil, Avatar e Senha',
      description: 'Na aba Usuários, atualize sua foto de perfil, senha de 8 dígitos e permissões de unidades da equipe.',
      findTarget: () => findInMainByText('button', 'Salvar') || findVisible('main'),
    },
    {
      title: 'Configurar WhatsApp e Taxas',
      description: 'Na aba WhatsApp, ajuste regras de taxa de entrega por km, templates de mensagem e integração opcional via API.',
      findTarget: () => findInMainByText('button', 'WhatsApp') || findVisible('main'),
    },
    {
      title: 'Personalizar Cardápio Digital',
      description: 'Na aba Cardápio, compartilhe o link público e configure as animações de abertura e agradecimento.',
      findTarget: () => findInMainByText('button', 'Cardápio') || findVisible('main'),
    },
    {
      title: 'Gerenciar Dados e Backup',
      description: 'Na aba Dados, exporte/restaure backups em Excel ou popule/limpe dados mock no banco em nuvem.',
      findTarget: () => findInMainByText('button', 'Dados') || findVisible('main'),
    },
  ],
  painel: [
    {
      title: 'Indicadores e Metas',
      description: 'Acompanhe faturamento, pedidos de hoje, entregas e alertas de estoque mínimo em tempo real.',
      findTarget: () => findInMainByText('button', 'Indicadores') || findVisible('main'),
    },
    {
      title: 'Ferramentas Rápidas',
      description: 'Alterne para Ferramentas para calcular frete/CEP, roteirizar entregas, programar produção ou enviar WhatsApp.',
      findTarget: () => findInMainByText('button', 'Ferramentas') || findVisible('main'),
    },
  ],
};

interface TutorialOverlayProps {
  isOpen: boolean;
  currentScreen: ScreenId;
  onClose: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  isOpen,
  currentScreen,
  onClose,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const steps = SCREEN_TUTORIALS[currentScreen] || [];
  const currentStep = steps[stepIndex];

  const updateSpotlight = useCallback(() => {
    if (!isOpen || !currentStep) {
      setTargetRect(null);
      return;
    }
    const el = currentStep.findTarget();
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect(rect);
        return;
      }
    }
    setTargetRect(null);
  }, [isOpen, currentStep]);

  useEffect(() => {
    setStepIndex(0);
  }, [currentScreen, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(updateSpotlight, 60);
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, stepIndex, updateSpotlight, onClose]);

  if (!isOpen || !currentStep) return null;

  const isLast = stepIndex >= steps.length - 1;

  // Position tooltip near target or safely centered at bottom
  const tooltipStyle: React.CSSProperties = (() => {
    if (!targetRect) {
      return {
        left: '50%',
        bottom: '24px',
        transform: 'translateX(-50%)',
      };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = Math.min(340, vw - 24);
    const spaceBelow = vh - targetRect.bottom;
    const placeBelow = spaceBelow >= 190 || targetRect.top < 190;
    const left = Math.max(12, Math.min(vw - cardW - 12, targetRect.left));
    if (placeBelow) {
      return {
        left: `${left}px`,
        top: `${Math.min(vh - 195, targetRect.bottom + 12)}px`,
        width: `${cardW}px`,
      };
    }
    return {
      left: `${left}px`,
      bottom: `${Math.min(vh - 195, vh - targetRect.top + 12)}px`,
      width: `${cardW}px`,
    };
  })();

  return createPortal(
    <div className="fixed inset-0 z-[100] print:hidden">
      {/* Backdrop when no target rect */}
      {!targetRect && (
        <div
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}

      {/* Spotlight Cutout */}
      {targetRect && (
        <div
          className="fixed rounded-xl ring-4 ring-brand-500 transition-all duration-200 pointer-events-none"
          style={{
            left: `${Math.max(4, targetRect.left - 4)}px`,
            top: `${Math.max(4, targetRect.top - 4)}px`,
            width: `${targetRect.width + 8}px`,
            height: `${targetRect.height + 8}px`,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.58)',
          }}
        />
      )}

      {/* Tutorial Step Card */}
      <div
        className="fixed bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 space-y-3 z-[101]"
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-brand-600 shrink-0" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
              {SCREEN_NAMES[currentScreen]} • Passo {stepIndex + 1} de {steps.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            title="Fechar tutorial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-900">{currentStep.title}</h3>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{currentStep.description}</p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? 'w-4 bg-brand-600' : 'w-1.5 bg-slate-300'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex(s => Math.max(0, s - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 rounded-lg cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Concluir</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepIndex(s => Math.min(steps.length - 1, s + 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-xs cursor-pointer"
              >
                <span>Próximo</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
