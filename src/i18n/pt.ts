import type { Dictionary } from './en';

/**
 * Portuguese (Brazil).
 *
 * Terminology follows Brazilian farm practice: *talhão* for the management unit CropForce
 * calls a Field, *fazenda* for the Farm, *cliente* for the Client. The three attribute
 * names themselves stay in English wherever they name the exported column, because that
 * is literally what the shapefile header says and translating it would send someone
 * looking for a column that does not exist.
 */
export const pt: Dictionary = {
  'app.title': 'CropForce — Preparação de Contornos',
  'app.privacy': 'Os arquivos são processados apenas no seu navegador. Nada é enviado ou armazenado.',
  'app.privacyTooltip':
    'Sem servidor, sem banco de dados, sem analytics. Recarregar esta página descarta tudo.',
  'app.addFiles': 'Adicionar arquivos',
  'app.clear': 'Limpar',
  'app.clearConfirm': 'Descartar tudo na área de trabalho? Isso não pode ser desfeito.',
  'app.reading': 'Lendo arquivos…',
  'app.undo': 'Desfazer: {label} (Ctrl+Z)',
  'app.undoEmpty': 'Nada a desfazer (Ctrl+Z)',
  'app.redo': 'Refazer: {label} (Ctrl+Shift+Z)',
  'app.redoEmpty': 'Nada a refazer (Ctrl+Shift+Z)',
  'app.language': 'Idioma',

  'empty.heading': 'Prepare contornos de talhões para o CropForce',
  'empty.intro':
    'Carregue arquivos de contorno de qualquer origem, agrupe-os em talhões, ajuste-os aos ' +
    'critérios de contorno e exporte um único shapefile consolidado. Tudo acontece nesta ' +
    'aba do navegador.',
  'empty.step1.title': 'Solte seus arquivos',
  'empty.step1.body':
    'KML, KMZ, shapefiles zipados e GeoJSON, quantos quiser de uma vez. O que não estiver ' +
    'em WGS84 é reprojetado na entrada.',
  'empty.step2.title': 'Agrupe em talhões',
  'empty.step2.body': 'Um talhão é o conjunto de polígonos que você decidir que vai junto. Desenhe um e ele vira um talhão assim que você fechar; agrupe os importados selecionando-os e combinando-os em um talhão. Depois dê a ele um nome de Client, Farm e Field.',
  'empty.step3.title': 'Corrija os apontamentos',
  'empty.step3.body':
    'O painel de qualidade verifica cada talhão conforme os critérios de contorno. Cada ' +
    'apontamento oferece uma correção automática e um caminho manual, e tudo pode ser desfeito.',
  'empty.step4.title': 'Exporte um arquivo',
  'empty.step4.body':
    'Um único shapefile zipado com uma linha por talhão, pronto para enviar ao CropForce.',
  'empty.dropHere': 'Solte arquivos em qualquer lugar desta janela para começar.',
  'empty.choose': 'Escolher arquivos',
  'empty.formats':
    '.kml · .kmz · .zip (shapefile) · .geojson · .json · ou um conjunto solto .shp/.shx/.dbf/.prj',
  'empty.dropOverlay': 'Solte os arquivos de contorno para carregá-los',

  'tool.select': 'Selecionar',
  'tool.select.hint':
    'Clique em um polígono para selecioná-lo. Shift+clique adiciona à seleção.',
  'tool.edit': 'Vértices',
  'tool.edit.hint':
    'Arraste um vértice para movê-lo, clique nos marcadores intermediários para adicionar um, ' +
    'clique com o botão direito em um vértice para excluí-lo.',
  'tool.move': 'Mover',
  'tool.move.hint': 'Arraste o polígono inteiro sem alterar seu formato.',
  'tool.draw': 'Desenhar',
  'tool.draw.hint':
    'Clique para posicionar cada vértice, depois dê um duplo clique ou clique novamente no ' +
    'primeiro vértice para fechar o polígono.',
  'tool.cutHole': 'Recortar',
  'tool.cutHole.hint':
    'Desenhe ao redor de uma área para excluí-la — uma mancha de árvores, um carreador, um ' +
    'curso d’água, a base de um aerogerador. Dê um duplo clique para fechar a forma; o ' +
    'que ela cobrir é recortado dos polígonos abaixo, ou apenas dos polígonos selecionados ' +
    'quando houver seleção.',
  'tool.split': 'Dividir',
  'tool.split.hint':
    'Desenhe uma linha atravessando o polígono selecionado para cortá-lo em dois. Duplo ' +
    'clique para finalizar a linha.',
  'tool.simplify': 'Suavizar',
  'tool.simplify.hint':
    'Reduza o ruído de vértices com uma prévia ao vivo antes de confirmar qualquer coisa.',

  'toolbar.merge': 'Unir polígonos selecionados',
  'toolbar.mergeHint':
    'Unir os polígonos selecionados em um só (eles devem ser adjacentes ou sobrepostos)',
  'toolbar.delete': 'Excluir polígonos selecionados',
  'toolbar.deleteHint': 'Excluir os polígonos selecionados (Del)',
  'toolbar.snapping': 'Encaixe',
  'toolbar.snappingHint':
    'Enquanto você desenha ou arrasta um vértice, ele salta para qualquer ponto de contorno ' +
    'próximo, para que talhões vizinhos se encontrem exatamente em vez de deixar uma fresta ' +
    'ou sobreposição mínima. Não faz nada quando você não está desenhando ou editando.',
  'toolbar.imagery': 'Satélite',
  'toolbar.imageryHint': 'Esri World Imagery — a camada para traçar os contornos',
  'toolbar.street': 'Ruas',
  'toolbar.streetHint': 'OpenStreetMap — estradas e nomes de lugares para contexto',
  'toolbar.nothingSelected': 'Nada selecionado',
  'toolbar.selected': '{count} selecionado(s) · {area} ha',

  'map.locate': 'Ir para minha localização',
  'map.locateHint':
    'Ir para minha localização. O navegador pede sua permissão primeiro e pode consultar o ' +
    'próprio serviço de localização dele para responder. Seus dados de contorno nunca fazem ' +
    'parte disso.',
  'map.coordinates': 'Ir para coordenadas',
  'map.coordinatesHint': 'Ir para uma latitude e longitude, ou um link de mapa que você colou',
  'map.locating': 'Perguntando ao navegador onde você está…',
  'map.locatingPrompt':
    'O navegador está perguntando se pode compartilhar sua localização — escolha Permitir.',
  'map.locatingPrecise': 'Tentando novamente com uma posição mais precisa…',
  'map.error.unsupported':
    'Não foi possível obter sua localização: este navegador não oferece geolocalização.',
  'map.error.insecure':
    'Não foi possível obter sua localização: os navegadores só permitem isso em https:// ou ' +
    'em localhost.',
  'map.error.blocked':
    'Não foi possível obter sua localização: este site está bloqueado de usá-la. Clique no ' +
    'ícone à esquerda da barra de endereços, defina Localização como Permitir e tente de novo.',
  'map.error.denied':
    'Não foi possível obter sua localização: o navegador bloqueou. Permita o acesso à ' +
    'localização para este site na barra de endereços e tente de novo.',
  'map.error.timeout':
    'Não foi possível obter sua localização: o navegador não respondeu a tempo. Se ele pediu ' +
    'permissão, aceite o aviso e pressione o botão novamente — a espera conta contra a ' +
    'solicitação.',
  'map.error.unavailable': 'Não foi possível obter sua localização: o serviço de localização do navegador não conseguiu situar este dispositivo. Em um computador, isso costuma significar que a localização do sistema operacional está desligada — Windows: Configurações › Privacidade e segurança › Localização. macOS: Ajustes do Sistema › Privacidade e Segurança › Serviços de Localização, com o Chrome marcado. Os sites que ainda encontram você consultam seu IP nos servidores deles, o que esta ferramenta não faz.',

  'status.empty': 'Solte arquivos de contorno em qualquer lugar para começar',
  'status.group.one': '1 polígono esperando para ser agrupado em um talhão',
  'status.group.other': '{count} polígonos esperando para serem agrupados em talhões',
  'status.blocked.one': '1 talhão precisa de atenção antes de poder ser exportado',
  'status.blocked.other': '{count} talhões precisam de atenção antes de poderem ser exportados',
  'status.ready.one': '1 talhão pronto para exportar',
  'status.ready.other': 'Todos os {count} talhões prontos para exportar',
  'fields.progress': '{ready} de {total} prontos',
  'fields.progressLabel': 'Talhões prontos para exportar',
  'panel.hideFields': 'Ocultar a lista de talhões',
  'panel.showFields': 'Mostrar a lista de talhões',
  'panel.hideChecks': 'Ocultar o painel de qualidade',
  'panel.showChecks': 'Mostrar o painel de qualidade',
  'panel.resizeFields': 'Arraste para redimensionar a lista de talhões',
  'panel.resizeChecks': 'Arraste para redimensionar o painel de qualidade',
  'shortcuts.title': 'Atalhos de teclado',
  'shortcuts.open': 'Atalhos de teclado',
  'shortcuts.tools': 'Ferramentas',
  'shortcuts.actions': 'Ações',
  'shortcuts.deleteSelection': 'Excluir a seleção',
  'shortcuts.backToSelect': 'Cancelar — voltar para Selecionar',
  'shortcuts.help': 'Mostrar esta lista',
  'shortcuts.note': 'Os atalhos ficam desligados enquanto você digita em um campo.',
  'history.title': 'Ações recentes',
  'history.open': 'Ações recentes',
  'history.now': 'Agora',
  'history.jumpBack': 'Desfazer até aqui',
  'history.jumpForward': 'Refazer até aqui',
  'history.empty': 'Nada feito ainda.',

  'toolbar.drawInto': 'Desenhar em',
  'toolbar.drawIntoNew': 'Um novo talhão',
  'toolbar.drawIntoHint': 'Onde o próximo polígono desenhado vai parar. Escolha um talhão para acrescentar outro bloco a ele.',
  'tool.draw.hintNew': 'Clique para posicionar cada vértice e dê um duplo clique para fechar. O polígono vira um novo talhão, pronto para receber o nome.',
  'tool.draw.hintField': 'Clique para posicionar cada vértice e dê um duplo clique para fechar. O polígono entra em {field}.',
  'toast.drewNewField': 'Novo talhão desenhado. Dê um nome a ele para poder exportar.',
  'toast.drewIntoField': 'Polígono acrescentado a {field}.',
  'action.drawField': 'Desenhar um talhão',
  'action.drawIntoField': 'Desenhar em {field}',

  'map.error.diagnostic': ' O navegador informou o código {code}: {message}',
  'map.located': 'Você está aqui, com precisão de {accuracy}.',
  'map.locatedCoarse': 'Posição apenas aproximada: seu navegador localizou você com precisão de {accuracy}, então esta é a região certa, não o talhão certo. Navegue a partir daqui.',

  'flag.nonAscii.title': '{field} — caracteres que o CropForce não aceita',
  'flag.nonAscii.detail.one': '{columns} contém {characters}. O CropForce aceita apenas letras e números simples. A correção automática grava como “{example}”.',
  'flag.nonAscii.detail.other': '{columns} contêm {characters}. O CropForce aceita apenas letras e números simples. A correção automática grava o primeiro como “{example}”.',
  'guidance.non-ascii': 'Caracteres acentuados e não latinos não sobrevivem ao upload: o CropForce aceita letras, números e pontuação simples. Améca precisa chegar como Ameca e Caiçara como Caicara. Os nomes lidos de um arquivo já são convertidos na entrada; esta verificação pega os que forem digitados depois. Dois nomes que só diferiam pelo acento viram o mesmo nome depois da conversão, então a correção os numera se isso acontecer.',
  'category.non-ascii': 'Acentos',
  'fix.asciified.one': '1 nome reescrito sem acentos.',
  'fix.asciified.other': '{count} nomes reescritos sem acentos.',
  'fix.alreadyPlain': 'Todos os nomes já estão sem acentos.',
  'tree.open': 'Visão geral Client / Farm / Field',
  'tree.title': 'Client / Farm / Field',
  'tree.intro': 'Tudo desta sessão, na ordem em que o CropForce organiza. Escolha qualquer linha para trabalhar nela.',
  'tree.empty': 'Nada carregado ainda.',
  'tree.noClient': '(sem cliente)',
  'tree.noFarm': '(sem fazenda)',
  'tree.noField': '(talhão sem nome)',
  'tree.counts.one': '1 talhão',
  'tree.counts.other': '{count} talhões',
  'tree.farms.one': '1 fazenda',
  'tree.farms.other': '{count} fazendas',
  'tree.ungrouped.one': '1 polígono fora de qualquer talhão',
  'tree.ungrouped.other': '{count} polígonos fora de qualquer talhão',
  'tree.blocking': '{count} bloqueando',
  'tree.expandAll': 'Expandir tudo',
  'tree.collapseAll': 'Recolher tudo',
  'tree.copy': 'Copiar como texto',
  'tree.copied': 'Visão geral copiada para a área de transferência.',

  'import.chooseFiles': 'Quais arquivos?',
  'import.chooseHelp': 'Desmarque o que você não quiser. Arquivos cujo nome já está na área de trabalho vêm desmarcados, porque carregar o mesmo duas vezes é a forma mais comum de duplicar um contorno.',
  'import.alreadyLoaded': 'já carregado',
  'import.selectFile': 'Incluir {file}',
  'import.selectAllFiles': 'Incluir todos os arquivos',
  'import.noneChosen': 'Nenhum arquivo marcado.',
  'import.preview': 'O que há nos arquivos',
  'import.previewHelp': 'As primeiras linhas, como foram lidas. As colunas mapeadas estão destacadas.',
  'import.previewMore': 'e mais {count} linhas',
  'flag.duplicateGeometry.title': '{a} e {b} são o mesmo contorno',
  'flag.duplicateGeometry.detail': 'Eles compartilham {percent}% do menor ({area} ha). Isso normalmente é o mesmo talhão carregado duas vezes. A correção automática mantém o que você escolher e exclui o outro.',
  'guidance.duplicate-geometry': 'Dois talhões cobrindo o mesmo terreno quase sempre são um talhão importado duas vezes — um arquivo carregado de novo, ou o mesmo bloco presente em dois deles. Subir os dois conta a área em dobro e deixa duas linhas disputando o mesmo lugar. Fique com o que tiver o melhor nome e a melhor geometria e exclua o outro; se forem mesmo dois talhões vizinhos que apenas se sobrepõem, corrija a sobreposição.',
  'category.duplicate-geometry': 'Contorno repetido',
  'overlap.duplicateTitle': 'Manter um de dois contornos idênticos',
  'overlap.duplicateIntro': 'Estes dois cobrem o mesmo terreno. Escolha qual manter — o outro talhão e seus polígonos serão excluídos. Ctrl+Z traz de volta.',
  'overlap.duplicateConfirm': 'Excluir o outro talhão',
  'overlap.duplicateLoses': '{field} será excluído, com polígonos e tudo.',
  'fix.duplicateDeleted': '{field} excluído.',
  'fix.deletedFields.one': '1 talhão vazio excluído.',
  'fix.deletedFields.other': '{count} talhões vazios excluídos.',

  'bulk.delete': 'Excluir talhões',
  'bulk.deleteHint': 'Excluir todos os talhões marcados',
  'bulk.deleteConfirm.one': 'Excluir 1 talhão e seus polígonos?\n\nOK exclui os dois. Cancelar mantém os polígonos e remove apenas a linha do talhão.',
  'bulk.deleteConfirm.other': 'Excluir {count} talhões e seus polígonos?\n\nOK exclui os dois. Cancelar mantém os polígonos e remove apenas as linhas dos talhões.',
  'toast.bulkDeleted.one': '1 talhão excluído.',
  'toast.bulkDeleted.other': '{count} talhões excluídos.',
  'action.deleteFields': 'Excluir {count} talhões',

  'fields.title': 'Talhões',
  'fields.new': 'Desenhar talhão',
  'fields.newHint': 'Desenhe um contorno no mapa; ele vira um novo talhão assim que você fechar',
  'fields.attributeGuidance':
    'Client, Farm e Field são os únicos atributos que o CropForce lê, e são por eles que o ' +
    'contorno é associado ao produtor e à propriedade certos. Mantenha a grafia idêntica em ' +
    'todos os talhões do mesmo cliente e da mesma fazenda.',
  'fields.attributeLabel': 'Client / Farm / Field',
  'fields.empty':
    'Nada carregado ainda. Solte arquivos de contorno em qualquer lugar da janela, ou desenhe ' +
    'um polígono com a barra de ferramentas do mapa.',
  'fields.search': 'Buscar cliente, fazenda, talhão ou arquivo',
  'fields.searchLabel': 'Buscar talhões',
  'fields.clearSearch': 'Limpar busca',
  'fields.zoomMatches': 'Enquadrar talhões correspondentes',
  'fields.zoomMatchesHint': 'Enquadrar o mapa nos talhões correspondentes',
  'fields.zoom': 'Enquadrar',
  'fields.noMatches': 'Nada corresponde a “{search}”.',
  'fields.matchCount': '{shown} de {total} talhões',
  'fields.hiddenCount': '{count} ocultos',
  'fields.ungroupedCount': '{shown} de {total} não agrupados',
  'fields.shownOf': '{shown} exibidos de {total}',
  'fields.toExport.one': '1 talhão para exportar',
  'fields.toExport.other': '{count} talhões para exportar',
  'fields.client': 'Client',
  'fields.farm': 'Farm',
  'fields.field': 'Field',
  'fields.fieldPlaceholder': 'Nome do talhão',
  'fields.ha': 'ha',
  'fields.selectAllFields': 'Selecionar todos os talhões',
  'fields.selectAllFieldsHint': 'Selecionar todos os talhões para edição em massa',
  'fields.selectForBulk': 'Selecionar {name} para edição em massa',
  'fields.selectMembers': 'Selecionar os polígonos deste talhão',
  'fields.zoomToField': 'Enquadrar talhão',
  'fields.zoomToPolygon': 'Enquadrar polígono',
  'fields.blockingBadge.one': '1 problema bloqueando a exportação',
  'fields.blockingBadge.other': '{count} problemas bloqueando a exportação',
  'fields.polygonCount.one': '1 polígono',
  'fields.polygonCount.other': '{count} polígonos',
  'fields.noMembers':
    'Nenhum polígono atribuído. Selecione polígonos no mapa e adicione-os a este talhão.',
  'fields.ungroup': 'Desagrupar',
  'fields.ungroupHint': 'Liberar os polígonos e remover a linha do talhão',
  'fields.deleteField': 'Excluir talhão',
  'fields.deleteFieldHint': 'Excluir o talhão e seus polígonos',
  'fields.deleteFieldConfirm':
    'Excluir este talhão e seus polígonos?\n\nOK exclui ambos. Cancelar mantém os polígonos e ' +
    'remove apenas a linha do talhão.',

  'fields.showIssues': 'Ver os problemas de {name}',

  'filter.all': 'Todos',
  'filter.allHint': 'Todos os talhões',
  'filter.blocking': 'Bloqueando',
  'filter.blockingHint': 'Talhões que não podem ser exportados como estão',
  'filter.review': 'A revisar',
  'filter.reviewHint': 'Talhões com avisos que você ainda não marcou como revisados',
  'filter.clean': 'Sem pendência',
  'filter.cleanHint': 'Talhões sem nada pendente',

  'ungrouped.title': 'Polígonos não agrupados',
  'ungrouped.selectAll': 'Selecionar todos',

  'selection.count.one': '1 polígono selecionado',
  'selection.count.other': '{count} polígonos selecionados',
  'selection.zoom': 'Enquadrar seleção',
  'selection.combine': 'Combinar em um talhão',
  'selection.moveTo': 'Mover para o talhão…',
  'selection.moveToLabel': 'Mover a seleção para um talhão',
  'selection.ungroupOption': 'Desagrupar (sem talhão)',
  'selection.untitled': 'Talhão sem nome',
  'selection.merge': 'Unir',
  'selection.mergeHint': 'Dissolver os polígonos selecionados em um único polígono',
  'selection.delete': 'Excluir',
  'selection.deleteHint': 'Excluir os polígonos selecionados',

  'bulk.ticked.one': '1 talhão marcado',
  'bulk.ticked.other': '{count} talhões marcados',
  'bulk.label': 'Nomeação em massa',
  'bulk.guidance':
    'Defina o mesmo Client ou Farm em todos os talhões marcados de uma vez. Um campo deixado ' +
    'em branco não é aplicado, então você pode definir o Client sem tocar nos Farm que já ' +
    'estão lá. Os Field continuam por linha, porque cada um nomeia um talhão diferente.',
  'bulk.clear': 'Limpar marcações',
  'bulk.clientPlaceholder': 'Client para todos',
  'bulk.clientLabel': 'Client para todos os talhões marcados',
  'bulk.farmPlaceholder': 'Farm para todos',
  'bulk.farmLabel': 'Farm para todos os talhões marcados',
  'bulk.apply': 'Aplicar',

  'qa.title': 'Verificações de qualidade',
  'qa.criteriaLabel': 'O que faz um bom contorno de talhão',
  'qa.criteria':
    'Um contorno deve cobrir uma única zona de manejo contínua, conter apenas área de ' +
    'cultivo, excluir carreadores, cursos d’água, aerogeradores e manchas de árvores, ter ' +
    'bordas suavizadas, agrupar em um só talhão os blocos manejados como uma unidade, nunca ' +
    'sobrepor um talhão vizinho e usar nomes Client / Farm / Field consistentes.',
  'qa.blockingCount': '{count} bloqueando',
  'qa.reviewCount': '{count} a revisar',
  'qa.selectHint': 'Selecionar estes polígonos e enquadrá-los no mapa',
  'qa.selectAllFlagged': 'Selecionar todos apontados',
  'qa.selectAllFlaggedHint':
    'Selecionar todos os polígonos com algum apontamento e enquadrá-los no mapa',
  'qa.export': 'Exportar shapefile consolidado para o CropForce',
  'qa.readyNone': 'Agrupe alguns polígonos em talhões para habilitar a exportação.',
  'qa.ready.one': '1 talhão pronto. Avisos não bloqueiam a exportação.',
  'qa.ready.other': '{count} talhões prontos. Avisos não bloqueiam a exportação.',
  'qa.blocked': 'Problemas bloqueantes precisam ser resolvidos antes de gerar o arquivo.',
  'qa.noIssues':
    'Nenhum problema encontrado. As verificações rodam de novo automaticamente a cada edição.',
  'qa.sectionBlocking': 'Bloqueando a exportação',
  'qa.sectionWarnings': 'Vale revisar',
  'qa.sectionReviewed': '{count} revisados',
  'qa.autoFix': 'Corrigir',
  'qa.autoFixHint': 'Aplicar a correção automática — desfaça com Ctrl+Z se ficar errada',
  'qa.noAutoFix': 'Sem correção automática',
  'qa.noAutoFixHint':
    'Este precisa de olho humano — não há correção que acerte com frequência suficiente para ' +
    'ser aplicada automaticamente.',
  'qa.fixManually': 'Corrigir manualmente',
  'qa.markReviewed': 'Marcar revisado',
  'qa.markReviewedHint': 'Você já olhou e está tudo bem — tire da lista',
  'qa.unreview': 'Desmarcar',
  'qa.unreviewHint': 'Devolver isto à lista do que precisa ser olhado',
  'qa.selectFlagHint': 'Selecionar os polígonos deste talhão e enquadrá-los no mapa',

  'qa.scope.one': 'Mostrando 1 talhão selecionado',
  'qa.scope.other': 'Mostrando {count} talhões selecionados',
  'qa.scopeClear': 'Mostrar todos os talhões',
  'qa.scopeEmpty': 'Não há nada sinalizado nos talhões que você selecionou.',
  'qa.categoryAll': 'Todos',
  'qa.categoryLabel': 'Filtrar por problema',
  'qa.selectForBulk': 'Selecionar este problema para uma ação em lote',
  'qa.selectAllShown': 'Selecionar todos os problemas exibidos',
  'qa.bulkSelected.one': '1 problema selecionado',
  'qa.bulkSelected.other': '{count} problemas selecionados',
  'qa.bulkAutoFix': 'Corrigir {count}',
  'qa.bulkAutoFixHint': 'Aplica todas as correções automáticas de uma vez — um Ctrl+Z desfaz tudo',
  'qa.bulkReview': 'Marcar {count} como revisados',
  'qa.bulkReviewHint': 'Tira da lista todos os avisos selecionados',
  'qa.bulkClear': 'Limpar',
  'category.missing-attributes': 'Nomes faltando',
  'category.invalid-geometry': 'Geometria inválida',
  'category.overlap': 'Sobreposições',
  'category.jagged-edges': 'Bordas irregulares',
  'category.non-crop-area': 'Área não cultivada',
  'category.sliver': 'Fragmentos',
  'category.naming': 'Nomes de safra',
  'category.unassigned': 'Sem agrupamento',
  'category.empty-field': 'Talhões vazios',
  'category.duplicate-name': 'Nomes duplicados',
  'category.name-too-long': 'Nomes longos demais',

  'flag.missing.title.other': '{field} — {count} atributos faltando',
  'flag.missing.title.one': '{field} — 1 atributo faltando',
  'flag.missing.detail.one':
    '{columns} está vazio. Os três são obrigatórios antes da exportação.',
  'flag.missing.detail.other':
    '{columns} estão vazios. Os três são obrigatórios antes da exportação.',
  'flag.empty.title': '{field} — nenhum polígono atribuído',
  'flag.empty.detail': 'Este talhão seria exportado como uma linha sem geometria.',
  'flag.naming.title': '{field} — o nome parece ser da safra',
  'flag.naming.year':
    '“{name}” contém o ano {year}. Nomes de talhão devem permanecer os mesmos de safra para safra.',
  'flag.naming.crop':
    '“{name}” contém o nome de cultura “{crop}”. Nomeie o lugar, não o que está plantado nele ' +
    'este ano.',
  'flag.unassigned.title.one': '1 polígono não atribuído a um talhão',
  'flag.unassigned.title.other': '{count} polígonos não atribuídos a um talhão',
  'flag.unassigned.detail':
    'Estes não serão exportados. Selecione-os e use “Combinar em um talhão”, ou exclua-os se ' +
    'não forem necessários.',
  'flag.invalid.title': '{feature} — geometria inválida',
  'flag.invalid.detail': 'O contorno tem {reason}.',
  'flag.invalid.noRings': 'geometria sem anéis',
  'flag.invalid.shortRing': 'um anel com menos de 3 pontos distintos',
  'flag.invalid.notClosed': 'um anel que não está fechado',
  'flag.invalid.kinks.one': '1 auto-interseção (formato de gravata)',
  'flag.invalid.kinks.other': '{count} auto-interseções (formato de gravata)',
  'flag.sliver.title': '{feature} — fragmento ({area} ha)',
  'flag.sliver.detail':
    'Menor que o limite de {threshold} ha, então provavelmente é um resto de digitalização e ' +
    'não uma zona de manejo.',
  'flag.jagged.title': '{feature} — bordas irregulares ({count} vértices)',
  'flag.jagged.detail':
    'Os vértices ficam a cerca de {spacing} m entre si ao longo de {perimeter} m de contorno ' +
    '— {density} por hectare. Tolerância de suavização sugerida: {tolerance} m.',
  'flag.noncrop.title': '{feature} — possível área não cultivada incluída',
  'flag.noncrop.detail':
    'Cerca de {percent}% da área está em faixas mais estreitas que {width} m, que é o formato ' +
    'de um carreador, curso d’água ou bordadura. Confira contra a imagem — isto é um ' +
    'indício, não um veredito.',
  'flag.overlap.title': '{a} sobrepõe {b}',
  'flag.overlap.detail': 'Eles compartilham {area} ha ({squareMetres} m²).',
  'flag.duplicate.title': '{count} talhões compartilham o nome {field}',
  'flag.duplicate.detail':
    '{combination} é usado {count} vezes. O CropForce manteria apenas o último enviado e ' +
    'descartaria o resto. A correção automática numera os excedentes; se forem um só talhão ' +
    'em vários blocos, selecione-os e combine-os.',
  'flag.tooLong.title': '{field} — nome longo demais para a coluna',
  'flag.tooLong.detail.one':
    '{columns} passa do limite de {limit} caracteres e seria cortado na exportação. A ' +
    'correção automática corta em um limite de palavra e mantém todos os nomes distintos.',
  'flag.tooLong.detail.other':
    '{columns} passam do limite de {limit} caracteres e seriam cortados na exportação. A ' +
    'correção automática corta em um limite de palavra e mantém todos os nomes distintos.',
  'flag.untitled': 'Talhão sem nome',
  'flag.polygon': 'Polígono',

  'guidance.missing-attributes':
    'Cada talhão precisa de um Client, Farm e Field consistentes. Esses três valores são os ' +
    'únicos atributos que o CropForce lê, e são por eles que o contorno é associado ao ' +
    'produtor e à propriedade certos.',
  'guidance.invalid-geometry':
    'Um contorno deve ser uma única zona de manejo contínua com um traçado limpo. Anéis que ' +
    'se cruzam em "gravata" não têm um interior bem definido, então cálculos de área e ' +
    'sobreposição não são confiáveis.',
  'guidance.overlap':
    'Talhões não podem se sobrepor. Contornos sobrepostos contam a área duas vezes e tornam ' +
    'ambíguo a que talhão pertence uma observação. Talhões vizinhos devem ser conjugados — ' +
    'dividindo uma borda, não dividindo área.',
  'guidance.jagged-edges':
    'Contornos devem ser suavizados. Bordas irregulares geralmente vêm de traçar sobre imagem ' +
    'raster ou de registros brutos de GPS; elas somam ruído sem somar precisão.',
  'guidance.non-crop-area':
    'Um contorno deve conter apenas área de cultivo. Estradas, carreadores, cursos d’água, ' +
    'bordaduras, aerogeradores e manchas de árvores ficam fora do contorno ou dentro de uma ' +
    'zona de exclusão recortada nele.',
  'guidance.sliver':
    'Fragmentos soltos que sobraram da digitalização ou de um recorte malfeito não são zonas ' +
    'de manejo. Remova-os para que cada talhão seja a área realmente cultivada.',
  'guidance.naming':
    'Nomes de talhão devem identificar o lugar, não a safra. Um nome que carrega uma cultura ' +
    'ou um ano precisa ser renomeado a cada mudança de rotação, o que quebra a comparação ' +
    'ano a ano.',
  'guidance.unassigned':
    'Apenas polígonos agrupados em um talhão são exportados. Um talhão é o conjunto de ' +
    'polígonos que você decidir que pertencem juntos — vários blocos separados manejados como ' +
    'uma unidade devem ser um talhão, não vários.',
  'guidance.empty-field':
    'Uma linha de talhão precisa de geometria. Atribua ao menos um polígono a ela, ou exclua ' +
    'o talhão.',
  'guidance.duplicate-name':
    'O CropForce identifica um talhão pela combinação de Client, Farm e Field, então essa ' +
    'combinação precisa ser única. Envie duas linhas com a mesma combinação e a segunda ' +
    'substitui a primeira: um contorno some sem nenhum aviso. Renomeie para que cada uma seja ' +
    'distinta, ou — se realmente forem um só talhão cultivado em blocos separados — combine-as ' +
    'em um único talhão com um nome.',
  'guidance.name-too-long':
    'Client, Farm e Field são gravados como colunas de texto de 30 caracteres. Qualquer coisa ' +
    'mais longa é cortada quando o arquivo é escrito, e um nome cortado pode colidir com outro ' +
    'cortado no mesmo ponto — então dois talhões viram um só no envio. Encurte-os aqui, onde ' +
    'você vê o que está perdendo.',

  'label.consistentNaming': 'Nomes consistentes',
  'label.singleZone': 'Zona contínua única',
  'label.noOverlaps': 'Sem sobreposições',
  'label.smoothing': 'Suavização',
  'label.cropOnly': 'Apenas área de cultivo',
  'label.multiPolygon': 'Talhões multipolígono',

  'ui.whatThisChecks': 'O que esta verificação faz',
  'ui.close': 'Fechar {title}',

  'import.title': 'Importar contornos',
  'import.read.one': 'Lido 1 polígono de {files}.',
  'import.read.other': 'Lidos {count} polígonos de {files}.',
  'import.files.one': '1 arquivo',
  'import.files.other': '{count} arquivos',
  'import.notes': 'Observações',
  'import.errors': 'Não foi possível ler',
  'import.mappingTitle': 'Qual coluna é qual?',
  'import.mappingNone':
    'Estes arquivos não trazem atributos, então cada polígono chega sem nome para você ' +
    'agrupar e nomear.',
  'import.mappingHelp':
    'Aponte cada atributo do CropForce para a coluna que o contém — seja qual for o nome que o ' +
    'arquivo usa. O que ficar em branco você preenche depois. Cada polígono ainda chega como ' +
    'seu próprio talhão; nada é unido por você.',
  'import.leaveBlank': '— deixar em branco —',
  'import.noSecond': '— sem segunda coluna —',
  'import.columnLabel': 'coluna de {target}',
  'import.secondColumnLabel': 'segunda coluna de {target}',
  'import.joinLabel': 'formato de junção de {target}',
  'import.example': 'ex.: “{value}”',
  'import.tooLong': ' · {count} caracteres, acima da coluna de {limit}',
  'import.cancel': 'Cancelar',
  'import.confirm': 'Adicionar à área de trabalho',
  'import.added.one': 'Adicionado 1 polígono à área de trabalho.',
  'import.added.other': 'Adicionados {count} polígonos à área de trabalho.',
  'import.nothing': 'Nada a importar: nenhum polígono foi encontrado nesses arquivos.',
  'import.failed': 'Falha na importação: {message}',

  'overlap.title': 'Resolver sobreposição',
  'overlap.intro':
    'Escolha qual talhão fica com a área compartilhada. A sobreposição é então recortada do ' +
    'outro, deixando os dois talhões conjugados por uma borda comum e sem área contada duas ' +
    'vezes.',
  'overlap.polygons.one': '1 polígono',
  'overlap.polygons.other': '{count} polígonos',
  'overlap.noClient': 'sem cliente',
  'overlap.loses':
    '{field} perderá a área compartilhada. Ctrl+Z restaura se o resultado não for o esperado.',
  'overlap.confirm': 'Recortar a sobreposição',

  'export.title': 'Exportar para o CropForce',
  'export.blockedIntro':
    'A exportação está bloqueada até que estes sejam resolvidos. Cada um deles produziria um ' +
    'arquivo de contorno que o CropForce não consegue usar como está.',
  'export.noFields': 'Ainda não há talhões para exportar.',
  'export.rows': 'Linhas',
  'export.polygons': 'Polígonos',
  'export.projection': 'Projeção',
  'export.summary':
    'Uma linha por talhão, com os polígonos de cada talhão unidos em um único MultiPolygon, e ' +
    'Client, Farm e Field gravados como colunas de texto de 30 caracteres. O zip contém .shp, ' +
    '.shx, .dbf, .prj e .cpg.',
  'export.unassigned.one': '1 polígono não atribuído a um talhão não será incluído.',
  'export.unassigned.other': '{count} polígonos não atribuídos a um talhão não serão incluídos.',
  'export.warnings.one': '1 aviso não resolvido',
  'export.warnings.other': '{count} avisos não resolvidos',
  'export.andMore': 'e mais {count}.',
  'export.acknowledge': 'Baixar mesmo assim — já revisei estes avisos.',
  'export.fileName': 'Nome do arquivo',
  'export.localNote': 'Gerado no seu navegador. Nada é enviado.',
  'export.close': 'Fechar',
  'export.download': 'Baixar zip',
  'export.done': 'Baixado {name} com {count} linhas de talhão.',
  'export.failed': 'Falha na exportação: {message}',

  'coords.title': 'Ir para coordenadas',
  'coords.intro':
    'Cole uma latitude e longitude, ou um link do Google Maps ou do OpenStreetMap. O mapa vai ' +
    'até lá; nada é consultado online.',
  'coords.label': 'Latitude e longitude',
  'coords.readsAs': 'Lido como {value}',
  'coords.invalid':
    'Não é uma posição. Um nome de lugar exigiria uma consulta online, que esta ferramenta ' +
    'não faz.',
  'coords.help': 'Também aceita 48°51′23.8″N 2°21′07.9″E, links geo: e URLs de mapa coladas.',
  'coords.go': 'Ir',
  'coords.moved': 'Mapa movido para {value}.',

  'history.undo': 'Desfazer',
  'history.redo': 'Refazer',

  'action.import': 'Importar {count} polígonos',
  'action.draw': 'Desenhar polígono',
  'action.cutHole': 'Recortar zona de exclusão',
  'action.split': 'Dividir {count} polígonos',
  'action.editGeometry': 'Editar geometria',
  'action.deletePolygons': 'Excluir {count} polígonos',
  'action.mergePolygons': 'Unir polígonos',
  'action.combine': 'Combinar {count} polígonos em um talhão',
  'action.moveToField': 'Mover polígonos para o talhão',
  'action.removeFromField': 'Remover polígonos do talhão',
  'action.editAttributes': 'Editar atributos',
  'action.bulkNaming': 'Definir {columns} em {count} talhões',
  'action.ungroupField': 'Desagrupar talhão',
  'action.deleteField': 'Excluir talhão',
  'action.addField': 'Adicionar talhão',
  'action.autoFix': 'Correção: {title}',
  'action.clipOverlap': 'Correção: recortar sobreposição',
  'action.smooth': 'Suavizar a {tolerance} m',

  'action.autoFixMany': 'Corrigir {count} problemas',

  'toast.combined': 'Talhão criado. Preencha Client, Farm e Field para poder exportá-lo.',
  'toast.merged': 'Polígonos selecionados unidos em um só.',
  'toast.splitDone.one': '1 polígono dividido.',
  'toast.splitDone.other': '{count} polígonos divididos.',
  'toast.splitNone': 'A linha não atravessou o polígono selecionado por completo.',
  'toast.splitSelect': 'Selecione primeiro o polígono a dividir.',
  'toast.cutNothing': 'Essa forma não sobrepõe nenhum polígono, então nada foi recortado.',
  'toast.undoHint': '{message} Ctrl+Z desfaz.',
  'toast.smoothNothing': 'Nada a suavizar nessa tolerância.',
  'toast.bulkApplied.one': 'Aplicado {columns} a 1 talhão.',
  'toast.bulkApplied.other': 'Aplicado {columns} a {count} talhões.',
  'toast.flagsWithoutPolygons':
    'Esses apontamentos são sobre linhas de talhão, não sobre polígonos no mapa.',

  'note.unsupported': '{file}: tipo de arquivo não suportado (aceitamos .kml, .kmz, .zip, .geojson e .json).',
  'note.badKml': 'o KML não é um XML bem formado.',
  'note.noKmlInArchive': 'nenhum arquivo .kml encontrado dentro do pacote.',
  'note.mergedKml': '{file}: {count} documentos KML do pacote foram combinados.',
  'note.noPrj': '{file}: nenhum .prj encontrado — as coordenadas foram lidas como WGS84. Confira o resultado no mapa.',
  'note.alreadyWgs84': '{file}: já está em WGS84 ({crs}).',
  'note.reprojected': '{file}: reprojetado de {crs} para WGS84.',
  'note.needShp': 'é necessário um arquivo .shp junto com as demais partes do shapefile.',
  'note.noDbf': '{file}: nenhum .dbf selecionado, portanto nenhum atributo foi trazido.',
  'note.badPrj': '{file}: não foi possível ler o .prj; as coordenadas foram assumidas como WGS84.',
  'note.noPrjSelected': '{file}: nenhum .prj selecionado — as coordenadas foram lidas como WGS84.',
  'note.epsgUnsupported': '{file}: declara EPSG:{code}, que esta ferramenta não converte offline. Reexporte o arquivo como WGS84 (EPSG:4326) ou como shapefile compactado com .prj.',
  'note.epsgFailed': '{file}: não foi possível inicializar EPSG:{code}.',
  'note.outOfRange': '{file}: as coordenadas estão fora da faixa válida de longitude/latitude e o arquivo não declara CRS, então não é possível posicioná-lo no mapa. Reexporte como WGS84.',
  'note.noPolygons': '{file}: nenhum polígono encontrado (pontos e linhas não podem virar talhões).',
  'note.skipped.one': '{file}: 1 feição não poligonal ignorada.',
  'note.skipped.other': '{file}: {count} feições não poligonais ignoradas.',
  'note.degenerate.one': '{file}: 1 polígono vazio ou degenerado descartado.',
  'note.degenerate.other': '{file}: {count} polígonos vazios ou degenerados descartados.',
  'join.parentheses': 'Nome (extra)',
  'join.dash': 'Nome - extra',
  'join.space': 'Nome extra',
  'join.prefix': 'extra - Nome',

  'toast.bulkFixed.one': '1 problema corrigido.',
  'toast.bulkFixed.other': '{count} problemas corrigidos.',
  'toast.bulkSkipped.one': ' 1 sobreposição ainda depende de você escolher qual talhão fica com a área compartilhada.',
  'toast.bulkSkipped.other': ' {count} sobreposições ainda dependem de você escolher qual talhão fica com a área compartilhada.',
  'toast.bulkNothingFixed': 'Nenhum dos problemas selecionados tem correção automática.',
  'toast.bulkReviewed.one': '1 aviso marcado como revisado.',
  'toast.bulkReviewed.other': '{count} avisos marcados como revisados.',

  'smoothing.title': 'Prévia da suavização',
  'smoothing.label': 'Suavização',
  'smoothing.guidance':
    'Contornos traçados sobre imagem ou registrados por GPS carregam muito mais vértices do ' +
    'que o formato precisa. A suavização remove o ruído sem mover o contorno além da ' +
    'tolerância que você definir. O traçado tracejado é o resultado; nada é confirmado até ' +
    'você aplicar.',
  'smoothing.tolerance': 'Tolerância de suavização em metros',
  'smoothing.vertices': 'Vértices',
  'smoothing.removed': 'Removidos',
  'smoothing.areaChange': 'Variação de área',
  'smoothing.apply': 'Aplicar suavização',
  'smoothing.cancel': 'Cancelar',
  'smoothing.verticesValue': '{before} para {after}',

  'fix.repaired.one': 'Reparado 1 polígono',
  'fix.repaired.other': 'Reparados {count} polígonos',
  'fix.and': ' e ',
  'fix.dropped': 'removidos {count} que não puderam ser reparados',
  'fix.deletedSlivers.one': '1 fragmento excluído.',
  'fix.deletedSlivers.other': '{count} fragmentos excluídos.',
  'fix.smoothed': 'Suavizado a {tolerance} m: {before} vértices reduzidos para {after}.',
  'fix.clipped': 'Área compartilhada recortada do outro talhão.',
  'fix.clippedRemoved.one': ' 1 polígono estava inteiramente dentro do talhão mantido e foi removido.',
  'fix.clippedRemoved.other':
    ' {count} polígonos estavam inteiramente dentro do talhão mantido e foram removidos.',
  'fix.noOverlap': 'Nada a recortar — a sobreposição já havia sumido.',
  'fix.noKeeper': 'O talhão a manter não tem geometria.',
  'fix.renamed.one': 'Renomeado 1 talhão para que cada combinação seja única.',
  'fix.renamed.other': 'Renomeados {count} talhões para que cada combinação seja única.',
  'fix.shortened.one': '1 nome encurtado para {limit} caracteres.',
  'fix.shortened.other': '{count} nomes encurtados para {limit} caracteres.',
  'fix.shortenedCollided': ' Dois deles ficaram iguais, então foram numerados para se distinguir.',
  'fix.alreadyFits': 'Todos os nomes já cabem.',
};
