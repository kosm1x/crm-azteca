/**
 * Swarm Tool — Multi-dimensional parallel analysis
 *
 * Single tool entry point that dispatches to predefined recipes.
 * Each recipe runs 4-6 existing tool handlers in parallel via Promise.allSettled.
 */

import type { ToolContext } from './index.js';
import { getRecipe, getRecipesForRole, RECIPES } from './swarm-recipes.js';

export async function ejecutar_swarm(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const receta = args.receta as string;

  if (!receta) {
    const available = getRecipesForRole(ctx.rol);
    return JSON.stringify({
      error: 'Se requiere el parámetro "receta".',
      recetas_disponibles: available.map(r => ({ id: r.id, nombre: r.nombre, descripcion: r.descripcion })),
    });
  }

  const recipe = getRecipe(receta);

  if (!recipe) {
    return JSON.stringify({
      error: `Receta desconocida: "${receta}".`,
      recetas_disponibles: RECIPES.map(r => ({ id: r.id, nombre: r.nombre })),
    });
  }

  if (!recipe.roles.includes(ctx.rol as any)) {
    return JSON.stringify({
      error: `La receta "${receta}" no está disponible para el rol ${ctx.rol}.`,
      recetas_disponibles: getRecipesForRole(ctx.rol).map(r => ({ id: r.id, nombre: r.nombre })),
    });
  }

  const result = await recipe.execute(ctx, args);
  return JSON.stringify(result);
}
