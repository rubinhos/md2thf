import * as fs from 'fs';
import marked from 'marked';
import mustache from 'mustache';
import * as path from 'path';

import { Component, Components } from './component';
import { Transform } from './helpers';
import { Options } from './options';
import { MarkdownFile, PoRenderer } from './renderer';
import * as templates from './templates';

/**
 * Executa a criação dos componentes `Angular` gerados a partir dos arquivos
 * `markdown` encontrados no caminho de origem.
 */
export class Converter {
  private srcPath: string;
  private destDir: string;
  private options: Options;

  constructor(srcPath?: string, destDir?: string, options?: Options) {
    this.srcPath = srcPath;
    this.destDir = destDir;
    this.options = options;
  }

  /**
   * Executa a conversão dos arquivos `markdown`.
   */
  public execute(): void {
    if (this.options.home) this.createHomeFile();

    const components = this.getMarkdownFiles().map((f, i, l) => new Component(this.srcPath, f, this.options, i === l.length - 1 ? '' : ','));
    components.forEach((component) => this.createComponentFiles(component));

    if (this.options.createHelpers) {
      this.createModuleFile(components);
      this.createRouterFile(components);
      this.createServiceFile(components);
    }
  }

  /**
   * Executa a conversão do conteúdo `markdown` para `PO-UI`.
   *
   * @param markdown conteúdo `markdown`
   * @returns conteúdo convertido para `PO-UI`
   */
  public convert(markdown: string): string {
    markdown = Transform.textToIcon(markdown);

    const renderer = new PoRenderer();
    const content = marked(markdown, { renderer });

    return mustache.render(templates.componentView(), { title: renderer.getTitle(), content });
  }

  /**
   * Cria a página inicial com o menu dos componentes criados.
   */
  private createHomeFile() {
    const moduleName = this.options.moduleName;
    const moduleClassName = Transform.pascalCase(moduleName);

    this.createComponentDirectory('.');

    const classContent = mustache.render(templates.home(), { moduleClassName, moduleName });
    this.writeFile(path.join(this.destDir, `${this.options.moduleName}-home.component.ts`), classContent);

    const viewContent = mustache.render(templates.homeView(), { moduleClassName, moduleName });
    this.writeFile(path.join(this.destDir, `${this.options.moduleName}-home.component.html`), viewContent);
  }

  /**
   * Cria os arquivos do componente (classe e view) a partir da conversão do
   * arquivo `markdown`.
   *
   * @param component objeto com as informações do componente
   */
  private createComponentFiles(component: Component): void {
    const dir = this.createComponentDirectory(component.getPath());

    const ts = this.renderComponentClass(component);
    this.writeFile(path.join(dir, `${component.getName()}.component.ts`), ts);

    const html = this.renderComponentView(component);
    this.writeFile(path.join(dir, `${component.getName()}.component.html`), html);
  }

  /**
   * Cria a pasta de destino dos arquivos de componente.
   *
   * @param destPath caminho relativo do diretório de destino
   * @returns caminho completo do diretório de destino criado
   */
  private createComponentDirectory(destPath: string): string {
    const dirPath = path.join(this.destDir, destPath);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
  }

  /**
   * Renderiza o conteúdo do componente a partir do _template_ e das
   * informações do componente informado.
   *
   * @param component objeto com as informações do componente
   * @returns conteúdo da classe do componente renderizado
   */
  private renderComponentClass(component: Component): string {
    return mustache.render(templates.component(), { component });
  }

  /**
   * Renderiza o conteúdo da _view_ do componente a partir do _template_ e das
   * informações do componente informado.
   *
   * @param component objeto com as informações do componente
   * @returns conteúdo da _view_ do componente renderizado
   */
  private renderComponentView(component: Component): string {
    const markdown = Transform.textToIcon(fs.readFileSync(component.getFile(), 'utf-8'));

    this.options.renderer = new PoRenderer();
    const content = marked(markdown, this.options);

    component.setTitle(this.options.renderer.getTitle());

    // Efetua a cópia dos arquivos externos encontrados no Markdown.
    if (this.options.copyExternalFiles)
      this.copyFiles(
        path.dirname(component.getFile()),
        path.join(this.destDir, this.options.resourceFolderName),
        this.options.renderer.getFiles()
      );

    return mustache.render(templates.componentView(), { title: component.getTitle(), content });
  }

  /**
   * Cria o arquivo do módulo `Angular` para agrupar todos os componentes
   * criados.
   *
   * @param components lista dos objetos com as informações dos componentes
   */
  private createModuleFile(components: Components) {
    const imports = this.options.imports;
    const home = this.options.home;
    const moduleName = this.options.moduleName;
    const moduleClassName = Transform.pascalCase(moduleName);
    const content = mustache.render(templates.module(), { imports, home, components, moduleName, moduleClassName });
    this.writeFile(path.join(this.destDir, `${this.options.moduleName}.module.ts`), content);
  }

  /**
   * Cria o arquivo de roteamento `Angular` com o caminho de execução de todos
   * os componentes criados.
   *
   * @param components lista dos objetos com as informações dos componentes
   */
  private createRouterFile(components: Components) {
    const home = this.options.home;
    const moduleName = this.options.moduleName;
    const moduleClassName = Transform.pascalCase(moduleName);
    const content = mustache.render(templates.routing(), { home, components, moduleName, moduleClassName });
    this.writeFile(path.join(this.destDir, `${this.options.moduleName}-routing.module.ts`), content);
  }

  /**
   * Cria o arquivo de serviço `Angular` com métodos que auxiliam na criação do
   * menu com a lista de todos os componentes criados.
   *
   * @param components lista dos objetos com as informações dos componentes
   */
  private createServiceFile(components: Components) {
    const menuItems = this.loadMenuItems(components);
    const moduleName = this.options.moduleName;
    const moduleClassName = Transform.pascalCase(moduleName);
    const content = mustache.render(templates.service(), { moduleClassName, menuItems }, { menuItem: templates.menuItem() });
    this.writeFile(path.join(this.destDir, `${this.options.moduleName}.service.ts`), content);
  }

  /**
   * Carrega a estrutura dos itens de menu conforme a lista dos componentes
   * e a configuração `options.flatDirs`.
   *
   * @param components lista dos objetos com as informações dos componentes
   * @returns estrutura dos itens de menu
   */
  private loadMenuItems(components: Components): MenuItems {
    const menuItems: MenuItem[] = [];

    components.forEach((component) => {
      const label = component.getTitle() || component.getClassName();
      const menuItem: MenuItem = { label, menuItems: [], file: component.getFile() };

      if (this.options.parentRoutePath && this.options.parentRoutePath.length > 0) {
        menuItem.link = `${this.options.parentRoutePath}/${component.getName()}`;
      } else {
        menuItem.link = component.getName();
      }

      // Verifica se o componente atual é filho direto de algum componente
      // anterior.
      const parent = this.options.flatDirs ? null : this.getMenuParent(menuItems, component);

      if (parent) {
        parent.push(menuItem);
      } else {
        menuItems.push(menuItem);
      }
    });

    return menuItems;
  }

  /**
   * Verifica os itens de menu e o componente informado e retorna o menu pai ao
   * qual ele pertence.
   *
   * @param menuItems estrutura dos itens de menu
   * @param components lista dos objetos com as informações dos componentes
   *
   * @returns estrutura do item de menu pai do componente informado
   */
  private getMenuParent(menuItems: MenuItems, component: Component): MenuItems {
    let parent: MenuItems = null;

    for (let i = 0, len = menuItems.length; i < len; i++) {
      const menuItem = menuItems[i];
      const dirname = path.dirname(menuItem.file);
      const relative = path.relative(dirname, component.getFile());

      const regExp = new RegExp(`\\${path.sep}`, 'g'); // ^(?!\.\..*).*\\.*$
      const isChild = relative.indexOf('..') === -1 && (relative.match(regExp) || []).length === 1;

      if (isChild) return menuItem.menuItems;
      if (menuItem.menuItems.length > 0) parent = this.getMenuParent(menuItem.menuItems, component);
      if (parent) break;
    }

    return parent;
  }

  /**
   * Copia os arquivos externos encontrados no arquivo `markdown` para o
   * diretório de recursos configurado.
   *
   * @param srcDir diretório de origem do arquivo `markdown` atual
   * @param destDir diretório de destino onde serão criados os componentes
   * @param files lista dos arquivos externos encontrados no arquivo `markdown`
   */
  private copyFiles(srcDir: string, destDir: string, files: MarkdownFile[]) {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    files.forEach((file) => fs.copyFileSync(path.join(srcDir, file.from), path.join(destDir, file.to)));
  }

  /**
   * Retorna a lista de arquivos `markdown` encontrados abaixo da pasta
   * informada de forma recursiva ou não.
   *
   * @param searchPath caminho de busca de arquivos `markdown`
   * @returns lista dos arquivos `markdown` encontrados
   */
  private getMarkdownFiles(searchPath = this.srcPath): string[] {
    const recursive = this.options.recursive;

    if (fs.statSync(searchPath).isFile()) return [searchPath];

    return fs
      .readdirSync(searchPath)
      .sort((a, b) => (path.extname(a) === '.md' ? -1 : a < b ? -1 : 1)) // Arquivos `markdown` primeiro.
      .map((file) => path.join(searchPath, file))
      .filter((file) => !this.options.exclusions.some((exclusion) => path.dirname(file).startsWith(exclusion)))
      .flatMap((file) => (recursive && fs.statSync(file).isDirectory() ? this.getMarkdownFiles(file) : file))
      .filter((file) => this.options.exclusions.indexOf(file) === -1 && path.extname(file) === '.md');
  }

  private writeFile(dirpath: string, content: string): void {
    fs.writeFileSync(dirpath, content, 'utf-8');
  }
}

type MenuItem = { label: string; link?: string; menuItems: MenuItem[]; file: string };
type MenuItems = MenuItem[];
