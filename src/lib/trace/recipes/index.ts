import { compileBarChartRecipe } from './bar-chart';
import { compileCounterRecipe } from './counter';
import { compileKineticTextRecipe } from './kinetic-text';
import { compileLowerThirdRecipe } from './lower-third';
import { compileProgressRingRecipe } from './progress-ring';
import type {
  ExpandedRecipe,
  RecipeId,
} from './types';

export * from './types';
export { compileBarChartRecipe } from './bar-chart';
export { compileCounterRecipe } from './counter';
export { compileKineticTextRecipe } from './kinetic-text';
export { compileLowerThirdRecipe } from './lower-third';
export { compileProgressRingRecipe } from './progress-ring';

export function expandRecipe(
  recipeId: RecipeId | string,
  options: Record<string, any>,
  idFactory: (prefix: string) => string,
): ExpandedRecipe {
  switch (recipeId) {
    case 'lower-third':
      return compileLowerThirdRecipe(options, idFactory);
    case 'progress-ring':
      return compileProgressRingRecipe(options, idFactory);
    case 'bar-chart':
      return compileBarChartRecipe(options, idFactory);
    case 'kinetic-text':
      return compileKineticTextRecipe(options, idFactory);
    case 'counter':
      return compileCounterRecipe(options, idFactory);
    default:
      throw new Error(`Unknown recipe: "${recipeId}"`);
  }
}
