import { InvoiceStatus } from '../types';

export interface FaturamentoReportRow {
  unidadeId: string;
  unidadeNome: string;
  dataExtratoIso: string;
  dataExtratoLabel: string;
  numeroPedido: string;
  formaPagamentoPedido: string;
  dataPedidoIso: string;
  clienteNome: string;
  valor: number;
  valorRecebido: number;
  saldoAReceber: number;
  formaPagamentoFinanceiro: string;
  conciliado: boolean;
  nfStatus: InvoiceStatus;
  nfStatusLabel: string;
}

export type FaturamentoConciliationKey = 'CONCILIADO' | 'NAO_CONCILIADO';

export interface FaturamentoConciliationSubgroup {
  key: FaturamentoConciliationKey;
  label: 'Conciliado' | 'Não Conciliado';
  rows: FaturamentoReportRow[];
  totalValor: number;
  totalRecebido: number;
  totalSaldo: number;
}

export interface FaturamentoUnitGroup {
  unidadeId: string;
  unidadeNome: string;
  subgroups: FaturamentoConciliationSubgroup[];
  rows: FaturamentoReportRow[];
  totalValor: number;
  totalRecebido: number;
  totalSaldo: number;
}

export interface FaturamentoReportData {
  unitLabel: string;
  filterLabel: string;
  dateFilterLabel: string;
  statementPeriodLabel: string;
  generatedAtLabel: string;
  groups: FaturamentoUnitGroup[];
  totalOrders: number;
  grandTotalValor: number;
  grandTotalRecebido: number;
  grandTotalSaldo: number;
}

export interface FaturamentoGroupedSummary {
  groups: FaturamentoUnitGroup[];
  totalOrders: number;
  grandTotalValor: number;
  grandTotalRecebido: number;
  grandTotalSaldo: number;
}

export function resolveOrderBillingUnitId(order: {
  tipoEntrega?: string;
  unidadeOrigemId: string;
  unidadeRetiradaId?: string;
}): string {
  if (order.tipoEntrega === 'RETIRADA' && order.unidadeRetiradaId) {
    return order.unidadeRetiradaId;
  }
  return order.unidadeOrigemId;
}

export function formatPedidoWithPaymentMethod(
  numeroPedido: string,
  formaPagamentoPedido?: string
): string {
  const method = (formaPagamentoPedido || '').trim();
  return method ? `${numeroPedido} (${method})` : numeroPedido;
}

function roundMoney(value: number): number {
  return Number((Number(value) || 0).toFixed(2));
}

function sortFaturamentoRows(rows: FaturamentoReportRow[]): FaturamentoReportRow[] {
  return [...rows].sort((a, b) => {
    const extA = a.dataExtratoIso || '9999-99-99';
    const extB = b.dataExtratoIso || '9999-99-99';
    if (extA !== extB) return extA.localeCompare(extB);

    const pedA = a.dataPedidoIso || '9999-99-99';
    const pedB = b.dataPedidoIso || '9999-99-99';
    if (pedA !== pedB) return pedA.localeCompare(pedB);

    const clientCmp = a.clienteNome.localeCompare(b.clienteNome, 'pt-BR', {
      sensitivity: 'base',
    });
    if (clientCmp !== 0) return clientCmp;

    return a.numeroPedido.localeCompare(b.numeroPedido, 'pt-BR', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function buildSubgroup(
  key: FaturamentoConciliationKey,
  label: 'Conciliado' | 'Não Conciliado',
  rows: FaturamentoReportRow[]
): FaturamentoConciliationSubgroup {
  const sortedRows = sortFaturamentoRows(rows);
  return {
    key,
    label,
    rows: sortedRows,
    totalValor: roundMoney(sortedRows.reduce((sum, r) => sum + (Number(r.valor) || 0), 0)),
    totalRecebido: roundMoney(
      sortedRows.reduce((sum, r) => sum + (Number(r.valorRecebido) || 0), 0)
    ),
    totalSaldo: roundMoney(
      sortedRows.reduce((sum, r) => sum + (Number(r.saldoAReceber) || 0), 0)
    ),
  };
}

export function groupAndSortFaturamentoRows(
  rows: FaturamentoReportRow[]
): FaturamentoGroupedSummary {
  const byUnit = new Map<
    string,
    { unidadeId: string; unidadeNome: string; rows: FaturamentoReportRow[] }
  >();

  for (const row of rows) {
    const unitName = (row.unidadeNome || '').trim() || 'Unidade Não Identificada';
    const unitKey = `${unitName.toLowerCase()}::${row.unidadeId || ''}`;
    const existing = byUnit.get(unitKey);
    if (existing) {
      existing.rows.push(row);
    } else {
      byUnit.set(unitKey, {
        unidadeId: row.unidadeId || '',
        unidadeNome: unitName,
        rows: [row],
      });
    }
  }

  const groups: FaturamentoUnitGroup[] = Array.from(byUnit.values())
    .sort((a, b) =>
      a.unidadeNome.localeCompare(b.unidadeNome, 'pt-BR', { sensitivity: 'base' })
    )
    .map(group => {
      const conciliatedRows = group.rows.filter(r => r.conciliado === true);
      const nonConciliatedRows = group.rows.filter(r => !r.conciliado);

      const subgroups: FaturamentoConciliationSubgroup[] = [];
      if (conciliatedRows.length > 0) {
        subgroups.push(buildSubgroup('CONCILIADO', 'Conciliado', conciliatedRows));
      }
      if (nonConciliatedRows.length > 0) {
        subgroups.push(buildSubgroup('NAO_CONCILIADO', 'Não Conciliado', nonConciliatedRows));
      }

      const combinedRows = subgroups.flatMap(sg => sg.rows);
      const totalValor = roundMoney(subgroups.reduce((sum, sg) => sum + sg.totalValor, 0));
      const totalRecebido = roundMoney(
        subgroups.reduce((sum, sg) => sum + sg.totalRecebido, 0)
      );
      const totalSaldo = roundMoney(subgroups.reduce((sum, sg) => sum + sg.totalSaldo, 0));

      return {
        unidadeId: group.unidadeId,
        unidadeNome: group.unidadeNome,
        subgroups,
        rows: combinedRows,
        totalValor,
        totalRecebido,
        totalSaldo,
      };
    });

  const grandTotalValor = roundMoney(
    groups.reduce((sum, g) => sum + g.totalValor, 0)
  );
  const grandTotalRecebido = roundMoney(
    groups.reduce((sum, g) => sum + g.totalRecebido, 0)
  );
  const grandTotalSaldo = roundMoney(
    groups.reduce((sum, g) => sum + g.totalSaldo, 0)
  );

  return {
    groups,
    totalOrders: rows.length,
    grandTotalValor,
    grandTotalRecebido,
    grandTotalSaldo,
  };
}
