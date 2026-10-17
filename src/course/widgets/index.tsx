import type { ReactElement } from 'react';
import type { WidgetId } from '../types';
import { BudgetBuilder } from './Budget';
import { CaseAWidget, CaseBWidget, CaseCWidget } from './Cases';
import { FlippCalculator, MaxBidPanel, ReturnsPanel, ScenariosPanel, StressPanel } from './Calculator';
import { BeforeBidButton, DocChecklist } from './Checklists';
import { Completion, FinalCase, FinalQuiz } from './Finish';
import { EvidenceLegend, KitchenPlan, MarketBox, PaakostningEffect, PlanningNumbers, RiskBudget, SelfSave } from './Small';

export const WIDGETS: Record<WidgetId, () => ReactElement> = {
  evidenceLegend: EvidenceLegend,
  paakostning: PaakostningEffect,
  docChecklist: DocChecklist,
  beforeBid: BeforeBidButton,
  market: MarketBox,
  planningNumbers: PlanningNumbers,
  budget: BudgetBuilder,
  riskBudget: RiskBudget,
  calculator: FlippCalculator,
  scenarios: ScenariosPanel,
  stress: StressPanel,
  returns: ReturnsPanel,
  maxbud: MaxBidPanel,
  caseA: CaseAWidget,
  caseB: CaseBWidget,
  caseC: CaseCWidget,
  kitchenPlan: KitchenPlan,
  selfSave: SelfSave,
  finalCase: FinalCase,
  finalQuiz: FinalQuiz,
  completion: Completion,
};
