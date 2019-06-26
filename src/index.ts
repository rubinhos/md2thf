import { Converter } from './converter';
import { Options } from './options';

/**
 * Executa a criação dos componentes `Angular/THF` gerados a partir dos
 * arquivos `markdown` encontrados no diretório de origem.
 *
 * @param srcDir Diretório de origem de busca dos arquivos `markdown`.
 * @param destDir Diretório de destino onde serão criados os componentes.
 * @param options Configurações de renderização e conversão dos componentes.
 */
export = (srcDir: string, destDir: string, options?: Options) => new Converter(srcDir, destDir, options).execute();
