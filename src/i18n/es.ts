import type { Dictionary } from './en';

/**
 * Spanish (Latin America).
 *
 * Terminology follows the vocabulary used across the Southern Cone and the Andean
 * countries: *lote* for the management unit CropForce calls a Field, *finca* for the
 * Farm, *cliente* for the Client. Where the three attribute names refer to the exported
 * column they stay in English, because that is literally what the shapefile header says
 * and translating it would send someone looking for a column that does not exist.
 */
export const es: Dictionary = {
  'app.title': 'CropForce — Preparación de Contornos',
  'app.privacy': 'Los archivos se procesan solo en su navegador. Nada se sube ni se guarda.',
  'app.privacyTooltip':
    'Sin servidor, sin base de datos, sin analítica. Recargar esta página descarta todo.',
  'app.addFiles': 'Agregar archivos',
  'app.clear': 'Limpiar',
  'app.clearConfirm': '¿Descartar todo el espacio de trabajo? Esto no se puede deshacer.',
  'app.reading': 'Leyendo archivos…',
  'app.undo': 'Deshacer: {label} (Ctrl+Z)',
  'app.undoEmpty': 'Nada para deshacer (Ctrl+Z)',
  'app.redo': 'Rehacer: {label} (Ctrl+Shift+Z)',
  'app.redoEmpty': 'Nada para rehacer (Ctrl+Shift+Z)',
  'app.language': 'Idioma',

  'empty.heading': 'Prepare contornos de lotes para CropForce',
  'empty.intro':
    'Cargue archivos de contornos de cualquier origen, agrúpelos en lotes, corríjalos según ' +
    'los criterios de contorno y exporte un único shapefile combinado. Todo ocurre en esta ' +
    'pestaña del navegador.',
  'empty.step1.title': 'Suelte sus archivos',
  'empty.step1.body':
    'KML, KMZ, shapefiles comprimidos y GeoJSON, tantos a la vez como quiera. Lo que no esté ' +
    'ya en WGS84 se reproyecta al entrar.',
  'empty.step2.title': 'Agrupe en lotes',
  'empty.step2.body': 'Un lote es el conjunto de polígonos que usted decida que va junto. Dibuje uno y se convierte en lote apenas lo cierre; agrupe los importados seleccionándolos y combinándolos en un lote. Después póngale un nombre de Client, Farm y Field.',
  'empty.step3.title': 'Corrija las alertas',
  'empty.step3.body':
    'El panel de calidad revisa cada lote frente a los criterios de contorno. Cada alerta ' +
    'ofrece una corrección automática y una manual, y todo se puede deshacer.',
  'empty.step4.title': 'Exporte un solo archivo',
  'empty.step4.body':
    'Un único shapefile comprimido con una fila por lote, listo para subir a CropForce.',
  'empty.dropHere': 'Suelte archivos en cualquier parte de esta ventana para empezar.',
  'empty.choose': 'Elegir archivos',
  'empty.formats':
    '.kml · .kmz · .zip (shapefile) · .geojson · .json · o un juego suelto .shp/.shx/.dbf/.prj',
  'empty.dropOverlay': 'Suelte archivos de contornos para cargarlos',

  'tool.select': 'Seleccionar',
  'tool.select.hint':
    'Haga clic en un polígono para seleccionarlo. Shift+clic para agregarlo a la selección.',
  'tool.edit': 'Vértices',
  'tool.edit.hint':
    'Arrastre un vértice para moverlo, haga clic en los marcadores intermedios para agregar ' +
    'uno, clic derecho sobre un vértice para eliminarlo.',
  'tool.move': 'Mover',
  'tool.move.hint': 'Arrastre el polígono entero sin cambiar su forma.',
  'tool.draw': 'Dibujar',
  'tool.draw.hint':
    'Haga clic para colocar cada vértice y luego doble clic, o clic sobre el primer vértice, ' +
    'para cerrar el polígono.',
  'tool.cutHole': 'Recortar hueco',
  'tool.cutHole.hint':
    'Dibuje alrededor de un área para excluirla: una isla de árboles, un camino, un curso de ' +
    'agua, una base de aerogenerador. Doble clic para cerrar la forma; todo lo que cubra se ' +
    'recorta de los polígonos que estén debajo, o solo de los polígonos seleccionados cuando ' +
    'hay una selección.',
  'tool.split': 'Dividir',
  'tool.split.hint':
    'Dibuje una línea que cruce el polígono seleccionado para partirlo en dos. Doble clic ' +
    'para terminar la línea.',
  'tool.simplify': 'Suavizar',
  'tool.simplify.hint':
    'Reduce el ruido de vértices con una vista previa en vivo antes de confirmar nada.',

  'toolbar.merge': 'Unir polígonos seleccionados',
  'toolbar.mergeHint':
    'Une los polígonos seleccionados en uno solo (deberían ser contiguos o superpuestos)',
  'toolbar.delete': 'Eliminar polígonos seleccionados',
  'toolbar.deleteHint': 'Elimina los polígonos seleccionados (Supr)',
  'toolbar.snapping': 'Ajuste',
  'toolbar.snappingHint':
    'Mientras dibuja o arrastra un vértice, este salta a cualquier punto de contorno cercano, ' +
    'de modo que los lotes vecinos coincidan exactamente en vez de dejar una rendija o una ' +
    'superposición. No hace nada cuando usted no está dibujando ni editando.',
  'toolbar.imagery': 'Satélite',
  'toolbar.imageryHint': 'Esri World Imagery — la capa sobre la cual trazar contornos',
  'toolbar.street': 'Calles',
  'toolbar.streetHint': 'OpenStreetMap — caminos y nombres de lugares como referencia',
  'toolbar.nothingSelected': 'Nada seleccionado',
  'toolbar.selected': '{count} seleccionados · {area} ha',

  'map.locate': 'Ir a mi ubicación',
  'map.locateHint':
    'Acerca el mapa a su ubicación. El navegador le pide permiso primero y puede consultar su ' +
    'propio servicio de ubicación para responder. Sus datos de contornos nunca forman parte de eso.',
  'map.coordinates': 'Ir a coordenadas',
  'map.coordinatesHint': 'Salte a una latitud y longitud, o a un enlace de mapa que haya pegado',
  'map.locating': 'Preguntando al navegador dónde está usted…',
  'map.locatingPrompt': 'El navegador le está preguntando si desea compartir su ubicación: elija Permitir.',
  'map.locatingPrecise': 'Reintentando con una localización más precisa…',
  'map.error.unsupported':
    'No se pudo obtener su ubicación: este navegador no admite geolocalización.',
  'map.error.insecure':
    'No se pudo obtener su ubicación: los navegadores solo la permiten por https:// o en localhost.',
  'map.error.blocked':
    'No se pudo obtener su ubicación: este sitio tiene el permiso bloqueado. Haga clic en el ' +
    'ícono a la izquierda de la barra de direcciones, ponga Ubicación en Permitir y vuelva a intentar.',
  'map.error.denied':
    'No se pudo obtener su ubicación: el navegador la bloqueó. Permita el acceso a la ' +
    'ubicación para este sitio desde la barra de direcciones y vuelva a intentar.',
  'map.error.timeout':
    'No se pudo obtener su ubicación: el navegador no respondió a tiempo. Si le pidió permiso, ' +
    'acepte el aviso y presione el botón otra vez — la espera cuenta contra la solicitud.',
  'map.error.unavailable': 'No se pudo obtener su ubicación: su dispositivo no logró determinar dónde está. Una computadora sin GPS depende del servicio de ubicación del propio navegador, que a menudo no está disponible — desplace el mapa hasta sus lotes en su lugar.',

  'status.empty': 'Suelte archivos de contornos en cualquier parte para empezar',
  'status.group.one': '1 polígono esperando ser agrupado en un lote',
  'status.group.other': '{count} polígonos esperando ser agrupados en lotes',
  'status.blocked.one': '1 lote necesita atención antes de poder exportarse',
  'status.blocked.other': '{count} lotes necesitan atención antes de poder exportarse',
  'status.ready.one': '1 lote listo para exportar',
  'status.ready.other': 'Los {count} lotes están listos para exportar',
  'fields.progress': '{ready} de {total} listos',
  'fields.progressLabel': 'Lotes listos para exportar',
  'panel.hideFields': 'Ocultar la lista de lotes',
  'panel.showFields': 'Mostrar la lista de lotes',
  'panel.hideChecks': 'Ocultar el panel de calidad',
  'panel.showChecks': 'Mostrar el panel de calidad',
  'panel.resizeFields': 'Arrastre para redimensionar la lista de lotes',
  'panel.resizeChecks': 'Arrastre para redimensionar el panel de calidad',
  'shortcuts.title': 'Atajos de teclado',
  'shortcuts.open': 'Atajos de teclado',
  'shortcuts.tools': 'Herramientas',
  'shortcuts.actions': 'Acciones',
  'shortcuts.deleteSelection': 'Eliminar la selección',
  'shortcuts.backToSelect': 'Cancelar — volver a Seleccionar',
  'shortcuts.help': 'Mostrar esta lista',
  'shortcuts.note': 'Los atajos se desactivan mientras escribe en un campo.',
  'history.title': 'Acciones recientes',
  'history.open': 'Acciones recientes',
  'history.now': 'Ahora',
  'history.jumpBack': 'Deshacer hasta aquí',
  'history.jumpForward': 'Rehacer hasta aquí',
  'history.empty': 'Todavía no se hizo nada.',

  'toolbar.drawInto': 'Dibujar en',
  'toolbar.drawIntoNew': 'Un lote nuevo',
  'toolbar.drawIntoHint': 'Dónde va a caer el próximo polígono que dibuje. Elija un lote para agregarle otro bloque.',
  'tool.draw.hintNew': 'Haga clic para colocar cada vértice y luego doble clic para cerrar. El polígono se convierte en un lote nuevo, listo para nombrar.',
  'tool.draw.hintField': 'Haga clic para colocar cada vértice y luego doble clic para cerrar. El polígono se suma a {field}.',
  'toast.drewNewField': 'Lote nuevo dibujado. Póngale nombre para poder exportarlo.',
  'toast.drewIntoField': 'Se agregó un polígono a {field}.',
  'action.drawField': 'Dibujar un lote',
  'action.drawIntoField': 'Dibujar en {field}',

  'map.error.diagnostic': ' El navegador informó el código {code}: {message}',
  'map.located': 'Está aquí, con una precisión de {accuracy}.',
  'map.locatedCoarse': 'Posición solo aproximada: su navegador lo ubicó con una precisión de {accuracy}, así que esta es la zona correcta, no el lote correcto. Desplácese desde aquí.',

  'fields.title': 'Lotes',
  'fields.new': 'Dibujar lote',
  'fields.newHint': 'Dibuje un contorno en el mapa; se convierte en un lote nuevo apenas lo cierre',
  'fields.attributeGuidance':
    'Client, Farm y Field son los únicos atributos que CropForce lee, y son la forma en que un ' +
    'contorno se asocia al productor y al establecimiento correctos. Mantenga la escritura ' +
    'idéntica en todos los lotes que pertenezcan al mismo cliente y a la misma finca.',
  'fields.attributeLabel': 'Client / Farm / Field',
  'fields.empty':
    'Todavía no hay nada cargado. Suelte archivos de contornos en cualquier parte de la ' +
    'ventana, o dibuje un polígono con la barra de herramientas del mapa.',
  'fields.search': 'Buscar cliente, finca, lote o archivo',
  'fields.searchLabel': 'Buscar lotes',
  'fields.clearSearch': 'Limpiar búsqueda',
  'fields.zoomMatches': 'Acercar a los lotes coincidentes',
  'fields.zoomMatchesHint': 'Acerca el mapa a los lotes que coinciden',
  'fields.zoom': 'Acercar',
  'fields.noMatches': 'Nada coincide con «{search}».',
  'fields.matchCount': '{shown} de {total} lotes',
  'fields.hiddenCount': '{count} ocultos',
  'fields.ungroupedCount': '{shown} de {total} sin agrupar',
  'fields.shownOf': '{shown} visibles de {total}',
  'fields.toExport.one': '1 lote para exportar',
  'fields.toExport.other': '{count} lotes para exportar',
  'fields.client': 'Client',
  'fields.farm': 'Farm',
  'fields.field': 'Field',
  'fields.fieldPlaceholder': 'Nombre del lote',
  'fields.ha': 'ha',
  'fields.selectAllFields': 'Seleccionar todos los lotes',
  'fields.selectAllFieldsHint': 'Selecciona todos los lotes para edición masiva',
  'fields.selectForBulk': 'Seleccionar {name} para edición masiva',
  'fields.selectMembers': 'Seleccionar los polígonos de este lote',
  'fields.zoomToField': 'Acercar al lote',
  'fields.zoomToPolygon': 'Acercar al polígono',
  'fields.blockingBadge.one': '1 problema que bloquea la exportación',
  'fields.blockingBadge.other': '{count} problemas que bloquean la exportación',
  'fields.polygonCount.one': '1 polígono',
  'fields.polygonCount.other': '{count} polígonos',
  'fields.noMembers':
    'No hay polígonos asignados. Seleccione polígonos en el mapa y agréguelos a este lote.',
  'fields.ungroup': 'Desagrupar',
  'fields.ungroupHint': 'Libera los polígonos y elimina la fila del lote',
  'fields.deleteField': 'Eliminar lote',
  'fields.deleteFieldHint': 'Elimina el lote y sus polígonos',
  'fields.deleteFieldConfirm':
    '¿Eliminar este lote y sus polígonos?\n\nAceptar elimina ambos. Cancelar conserva los ' +
    'polígonos y solo quita la fila del lote.',

  'fields.showIssues': 'Ver los problemas de {name}',

  'filter.all': 'Todos',
  'filter.allHint': 'Todos los lotes',
  'filter.blocking': 'Bloqueantes',
  'filter.blockingHint': 'Lotes que no se pueden exportar tal como están',
  'filter.review': 'Por revisar',
  'filter.reviewHint': 'Lotes con avisos que usted no marcó como revisados',
  'filter.clean': 'Sin problemas',
  'filter.cleanHint': 'Lotes sin nada pendiente',

  'ungrouped.title': 'Polígonos sin agrupar',
  'ungrouped.selectAll': 'Seleccionar todos',

  'selection.count.one': '1 polígono seleccionado',
  'selection.count.other': '{count} polígonos seleccionados',
  'selection.zoom': 'Acercar a la selección',
  'selection.combine': 'Combinar en un lote',
  'selection.moveTo': 'Mover a un lote…',
  'selection.moveToLabel': 'Mover la selección a un lote',
  'selection.ungroupOption': 'Desagrupar (sin lote)',
  'selection.untitled': 'Lote sin nombre',
  'selection.merge': 'Unir',
  'selection.mergeHint': 'Disuelve los polígonos seleccionados en un solo polígono',
  'selection.delete': 'Eliminar',
  'selection.deleteHint': 'Elimina los polígonos seleccionados',

  'bulk.ticked.one': '1 lote marcado',
  'bulk.ticked.other': '{count} lotes marcados',
  'bulk.label': 'Nombrado masivo',
  'bulk.guidance':
    'Asigne el mismo Client o Farm a todos los lotes marcados de una vez. Un campo que quede ' +
    'vacío no se aplica, así que puede fijar el Client sin tocar los nombres de Farm que ya ' +
    'existen. Los nombres de Field quedan fila por fila, porque cada uno nombra un lote distinto.',
  'bulk.clear': 'Quitar marcas',
  'bulk.clientPlaceholder': 'Client para todos',
  'bulk.clientLabel': 'Client para todos los lotes marcados',
  'bulk.farmPlaceholder': 'Farm para todos',
  'bulk.farmLabel': 'Farm para todos los lotes marcados',
  'bulk.apply': 'Aplicar',

  'qa.title': 'Controles de calidad',
  'qa.criteriaLabel': 'Qué hace a un buen contorno de lote',
  'qa.criteria':
    'Un contorno debe cubrir una única zona de manejo continua, contener solo área de cultivo, ' +
    'excluir caminos, cursos de agua, aerogeneradores e islas de árboles, tener bordes ' +
    'suavizados, agrupar en un solo lote los bloques que se manejan como una unidad, nunca ' +
    'superponerse con un lote vecino y usar una nomenclatura Client / Farm / Field consistente.',
  'qa.blockingCount': '{count} bloqueantes',
  'qa.reviewCount': '{count} por revisar',
  'qa.selectHint': 'Selecciona estos polígonos y los encuadra en el mapa',
  'qa.selectAllFlagged': 'Seleccionar todo lo marcado',
  'qa.selectAllFlaggedHint':
    'Selecciona todos los polígonos que tienen alguna alerta y los encuadra en el mapa',
  'qa.export': 'Exportar shapefile combinado para CropForce',
  'qa.readyNone': 'Agrupe algunos polígonos en lotes para habilitar la exportación.',
  'qa.ready.one': '1 lote listo. Los avisos no bloquean la exportación.',
  'qa.ready.other': '{count} lotes listos. Los avisos no bloquean la exportación.',
  'qa.blocked': 'Los problemas bloqueantes deben resolverse antes de poder escribir el archivo.',
  'qa.noIssues':
    'No se encontraron problemas. Los controles se repiten automáticamente tras cada edición.',
  'qa.sectionBlocking': 'Bloquean la exportación',
  'qa.sectionWarnings': 'Conviene revisar',
  'qa.sectionReviewed': '{count} revisados',
  'qa.autoFix': 'Corregir',
  'qa.autoFixHint': 'Aplica la corrección automática — deshágala con Ctrl+Z si no es la correcta',
  'qa.noAutoFix': 'Sin corrección automática',
  'qa.noAutoFixHint':
    'Esta necesita criterio humano: no hay una corrección que acierte lo bastante seguido como ' +
    'para aplicarla sola.',
  'qa.fixManually': 'Corregir a mano',
  'qa.markReviewed': 'Marcar revisado',
  'qa.markReviewedHint': 'Ya lo miró y está bien — sáquelo de la lista',
  'qa.unreview': 'Quitar revisado',
  'qa.unreviewHint': 'Vuelve a ponerlo en la lista de cosas para mirar',
  'qa.selectFlagHint': 'Selecciona los polígonos de este lote y los encuadra en el mapa',

  'qa.scope.one': 'Mostrando 1 lote seleccionado',
  'qa.scope.other': 'Mostrando {count} lotes seleccionados',
  'qa.scopeClear': 'Mostrar todos los lotes',
  'qa.scopeEmpty': 'No hay nada marcado en los lotes que seleccionó.',
  'qa.categoryAll': 'Todos',
  'qa.categoryLabel': 'Filtrar por problema',
  'qa.selectForBulk': 'Seleccionar este problema para una acción masiva',
  'qa.selectAllShown': 'Seleccionar todos los problemas mostrados',
  'qa.bulkSelected.one': '1 problema seleccionado',
  'qa.bulkSelected.other': '{count} problemas seleccionados',
  'qa.bulkAutoFix': 'Corregir {count}',
  'qa.bulkAutoFixHint': 'Aplica todas las correcciones automáticas de una vez — un Ctrl+Z las deshace todas',
  'qa.bulkReview': 'Marcar {count} como revisados',
  'qa.bulkReviewHint': 'Saca de la lista todos los avisos seleccionados',
  'qa.bulkClear': 'Limpiar',
  'category.missing-attributes': 'Nombres faltantes',
  'category.invalid-geometry': 'Geometría inválida',
  'category.overlap': 'Superposiciones',
  'category.jagged-edges': 'Bordes dentados',
  'category.non-crop-area': 'Área no cultivada',
  'category.sliver': 'Astillas',
  'category.naming': 'Nombres de campaña',
  'category.unassigned': 'Sin agrupar',
  'category.empty-field': 'Lotes vacíos',
  'category.duplicate-name': 'Nombres duplicados',
  'category.name-too-long': 'Nombres demasiado largos',

  'flag.missing.title.other': '{field} — faltan {count} atributos',
  'flag.missing.title.one': '{field} — falta 1 atributo',
  'flag.missing.detail.one': '{columns} está vacío. Los tres son obligatorios antes de exportar.',
  'flag.missing.detail.other': '{columns} están vacíos. Los tres son obligatorios antes de exportar.',
  'flag.empty.title': '{field} — sin polígonos asignados',
  'flag.empty.detail': 'Este lote se exportaría como una fila sin geometría.',
  'flag.naming.title': '{field} — el nombre parece atado a la campaña',
  'flag.naming.year':
    '«{name}» contiene el año {year}. Los nombres de lote deberían mantenerse iguales de una ' +
    'campaña a la siguiente.',
  'flag.naming.crop':
    '«{name}» contiene el nombre del cultivo «{crop}». Nombre el lugar, no lo que se siembra ' +
    'este año.',
  'flag.unassigned.title.one': '1 polígono sin asignar a un lote',
  'flag.unassigned.title.other': '{count} polígonos sin asignar a un lote',
  'flag.unassigned.detail':
    'Estos no se exportarán. Selecciónelos y use «Combinar en un lote», o elimínelos si no hacen falta.',
  'flag.invalid.title': '{feature} — geometría inválida',
  'flag.invalid.detail': 'El contorno tiene {reason}.',
  'flag.invalid.noRings': 'una geometría sin anillos',
  'flag.invalid.shortRing': 'un anillo con menos de 3 puntos distintos',
  'flag.invalid.notClosed': 'un anillo que no está cerrado',
  'flag.invalid.kinks.one': '1 autointersección (moño)',
  'flag.invalid.kinks.other': '{count} autointersecciones (moño)',
  'flag.sliver.title': '{feature} — astilla ({area} ha)',
  'flag.sliver.detail':
    'Menor que el umbral de {threshold} ha, así que probablemente sea un fragmento de ' +
    'digitalización y no una zona de manejo.',
  'flag.jagged.title': '{feature} — bordes dentados ({count} vértices)',
  'flag.jagged.detail':
    'Los vértices están a unos {spacing} m entre sí a lo largo de {perimeter} m de contorno — ' +
    '{density} por hectárea. Tolerancia de suavizado sugerida: {tolerance} m.',
  'flag.noncrop.title': '{feature} — posible área no cultivada incluida',
  'flag.noncrop.detail':
    'Cerca del {percent}% del área está en franjas más angostas que {width} m, que es la forma ' +
    'que dejan un camino, un curso de agua o una cabecera. Contrástelo con la imagen satelital: ' +
    'esto es un indicio, no un veredicto.',
  'flag.overlap.title': '{a} se superpone con {b}',
  'flag.overlap.detail': 'Comparten {area} ha ({squareMetres} m²).',
  'flag.duplicate.title': '{count} lotes comparten el nombre {field}',
  'flag.duplicate.detail':
    '{combination} se usa {count} veces. CropForce conservaría solo el último que se suba y ' +
    'descartaría el resto. La corrección automática los numera aparte; si en realidad son un ' +
    'solo lote en varios bloques, selecciónelos y combínelos.',
  'flag.tooLong.title': '{field} — nombre demasiado largo para la columna',
  'flag.tooLong.detail.one':
    '{columns} supera el límite de {limit} caracteres y quedaría cortado al exportar. La ' +
    'corrección automática recorta en un límite de palabra y mantiene cada nombre distinto.',
  'flag.tooLong.detail.other':
    '{columns} superan el límite de {limit} caracteres y quedarían cortados al exportar. La ' +
    'corrección automática recorta en un límite de palabra y mantiene cada nombre distinto.',
  'flag.untitled': 'Lote sin nombre',
  'flag.polygon': 'Polígono',

  'guidance.missing-attributes':
    'Cada lote necesita un Client, un Farm y un Field consistentes. Esos tres valores son los ' +
    'únicos atributos que CropForce lee, y son la forma en que el contorno se asocia al ' +
    'productor y al establecimiento correctos.',
  'guidance.invalid-geometry':
    'Un contorno debe ser una única zona de manejo continua con un trazo limpio. Los anillos ' +
    'que se cruzan a sí mismos (en «moño») no tienen un interior bien definido, así que no se ' +
    'puede confiar en los cálculos de área ni de superposición.',
  'guidance.overlap':
    'Los lotes no deben superponerse. Los contornos superpuestos cuentan el área dos veces y ' +
    'vuelven ambiguo a qué lote pertenece una observación. Los lotes vecinos deberían quedar ' +
    'contiguos: compartiendo un borde, no compartiendo área.',
  'guidance.jagged-edges':
    'Los contornos deberían estar suavizados. Los bordes dentados suelen venir de calcar ' +
    'imágenes satelitales o de registros GPS crudos; agregan ruido sin agregar precisión.',
  'guidance.non-crop-area':
    'Un contorno debe contener solo área de cultivo. Caminos, huellas, cursos de agua, ' +
    'cabeceras, aerogeneradores e islas de árboles van fuera del contorno o dentro de una zona ' +
    'de exclusión recortada en él.',
  'guidance.sliver':
    'Los fragmentos sueltos que quedan de la digitalización o de un recorte mal hecho no son ' +
    'zonas de manejo. Elimínelos para que cada lote sea el área realmente trabajada.',
  'guidance.naming':
    'Los nombres de lote deberían identificar el lugar, no la campaña. Un nombre que lleva un ' +
    'cultivo o un año hay que renombrarlo cada vez que cambia la rotación, y eso rompe la ' +
    'comparación año contra año.',
  'guidance.unassigned':
    'Solo se exportan los polígonos agrupados en un lote. Un lote es el conjunto de polígonos ' +
    'que usted decida que va junto: varios bloques separados que se manejan como una unidad ' +
    'deberían ser un solo lote, no varios.',
  'guidance.empty-field':
    'Una fila de lote necesita geometría. Asígnele al menos un polígono, o elimine el lote.',
  'guidance.duplicate-name':
    'CropForce identifica un lote por su combinación de Client, Farm y Field, así que esa ' +
    'combinación tiene que ser única. Si sube dos filas con la misma, la segunda reemplaza a la ' +
    'primera: un contorno desaparece sin ningún aviso. O los renombra para que cada uno sea ' +
    'distinto o, si de verdad son un solo lote trabajado en bloques separados, los combina en ' +
    'un único lote con un solo nombre.',
  'guidance.name-too-long':
    'Client, Farm y Field se escriben como columnas de texto de 30 caracteres. Todo lo que ' +
    'exceda queda cortado al escribir el archivo, y un nombre cortado puede colisionar con otro ' +
    'cortado en el mismo punto: dos lotes se vuelven uno al subirlos. Acórtelos acá, donde ' +
    'puede ver qué está perdiendo.',

  'label.consistentNaming': 'Nomenclatura consistente',
  'label.singleZone': 'Zona continua única',
  'label.noOverlaps': 'Sin superposiciones',
  'label.smoothing': 'Suavizado',
  'label.cropOnly': 'Solo área de cultivo',
  'label.multiPolygon': 'Lotes multipolígono',

  'ui.whatThisChecks': 'Qué revisa este control',
  'ui.close': 'Cerrar {title}',

  'import.title': 'Importar contornos',
  'import.read.one': 'Se leyó 1 polígono de {files}.',
  'import.read.other': 'Se leyeron {count} polígonos de {files}.',
  'import.files.one': '1 archivo',
  'import.files.other': '{count} archivos',
  'import.notes': 'Notas',
  'import.errors': 'No se pudieron leer',
  'import.mappingTitle': '¿Qué columna es cuál?',
  'import.mappingNone':
    'Estos archivos no traen atributos, así que cada polígono llega sin nombre para que usted ' +
    'lo agrupe y lo nombre.',
  'import.mappingHelp':
    'Apunte cada atributo de CropForce a la columna que lo contiene, se llame como se llame en ' +
    'el archivo. Lo que deje en blanco lo completa usted. Cada polígono igual llega como su ' +
    'propio lote; nada se combina por su cuenta.',
  'import.leaveBlank': '— dejar en blanco —',
  'import.noSecond': '— sin segunda columna —',
  'import.columnLabel': 'Columna de {target}',
  'import.secondColumnLabel': 'Segunda columna de {target}',
  'import.joinLabel': 'Formato de unión de {target}',
  'import.example': 'p. ej. «{value}»',
  'import.tooLong': ' · {count} caracteres, supera la columna de {limit}',
  'import.cancel': 'Cancelar',
  'import.confirm': 'Agregar al espacio de trabajo',
  'import.added.one': 'Se agregó 1 polígono al espacio de trabajo.',
  'import.added.other': 'Se agregaron {count} polígonos al espacio de trabajo.',
  'import.nothing': 'Nada para importar: no se encontraron polígonos en esos archivos.',
  'import.failed': 'Falló la importación: {message}',

  'overlap.title': 'Resolver superposición',
  'overlap.intro':
    'Elija qué lote se queda con el área compartida. La superposición se recorta del otro, ' +
    'dejando los dos lotes contiguos a lo largo de un borde común y sin área contada dos veces.',
  'overlap.polygons.one': '1 polígono',
  'overlap.polygons.other': '{count} polígonos',
  'overlap.noClient': 'sin cliente',
  'overlap.loses':
    '{field} perderá el área compartida. Ctrl+Z la restaura si el resultado no es el que quería.',
  'overlap.confirm': 'Recortar la superposición',

  'export.title': 'Exportar para CropForce',
  'export.blockedIntro':
    'La exportación está bloqueada hasta que se resuelvan estos puntos. Cada uno produciría un ' +
    'archivo de contornos que CropForce no puede usar tal como está.',
  'export.noFields': 'Todavía no hay lotes para exportar.',
  'export.rows': 'Filas',
  'export.polygons': 'Polígonos',
  'export.projection': 'Proyección',
  'export.summary':
    'Una fila por lote, con los polígonos de cada lote unidos en un solo MultiPolygon, y con ' +
    'Client, Farm y Field escritos como columnas de texto de 30 caracteres. El zip contiene ' +
    '.shp, .shx, .dbf, .prj y .cpg.',
  'export.unassigned.one': '1 polígono sin asignar a un lote no se incluirá.',
  'export.unassigned.other': '{count} polígonos sin asignar a un lote no se incluirán.',
  'export.warnings.one': '1 aviso sin resolver',
  'export.warnings.other': '{count} avisos sin resolver',
  'export.andMore': 'y {count} más.',
  'export.acknowledge': 'Descargar igual — ya revisé estos avisos.',
  'export.fileName': 'Nombre del archivo',
  'export.localNote': 'Se escribe en su navegador. Nada se sube.',
  'export.close': 'Cerrar',
  'export.download': 'Descargar zip',
  'export.done': 'Se descargó {name} con {count} filas de lotes.',
  'export.failed': 'Falló la exportación: {message}',

  'coords.title': 'Ir a coordenadas',
  'coords.intro':
    'Pegue una latitud y longitud, o un enlace de Google Maps o de OpenStreetMap. El mapa salta ' +
    'hasta ahí; no se consulta nada en línea.',
  'coords.label': 'Latitud y longitud',
  'coords.readsAs': 'Se interpreta como {value}',
  'coords.invalid':
    'No es una posición. Un nombre de lugar requiere una búsqueda en línea, y esta herramienta ' +
    'no hace ninguna.',
  'coords.help': 'También acepta 48°51′23.8″N 2°21′07.9″E, enlaces geo: y URLs de mapas pegadas.',
  'coords.go': 'Ir',
  'coords.moved': 'Se movió el mapa a {value}.',

  'history.undo': 'Deshacer',
  'history.redo': 'Rehacer',

  'action.import': 'Importar {count} polígonos',
  'action.draw': 'Dibujar polígono',
  'action.cutHole': 'Recortar zona de exclusión',
  'action.split': 'Dividir {count} polígonos',
  'action.editGeometry': 'Editar geometría',
  'action.deletePolygons': 'Eliminar {count} polígonos',
  'action.mergePolygons': 'Unir polígonos',
  'action.combine': 'Combinar {count} polígonos en un lote',
  'action.moveToField': 'Mover polígonos a un lote',
  'action.removeFromField': 'Quitar polígonos del lote',
  'action.editAttributes': 'Editar atributos',
  'action.bulkNaming': 'Fijar {columns} en {count} lotes',
  'action.ungroupField': 'Desagrupar lote',
  'action.deleteField': 'Eliminar lote',
  'action.addField': 'Agregar lote',
  'action.autoFix': 'Corrección: {title}',
  'action.clipOverlap': 'Corrección: recortar superposición',
  'action.smooth': 'Suavizar a {tolerance} m',

  'action.autoFixMany': 'Corregir {count} problemas',

  'toast.combined': 'Se creó un lote. Complete Client, Farm y Field para poder exportarlo.',
  'toast.merged': 'Se unieron los polígonos seleccionados en uno solo.',
  'toast.splitDone.one': 'Se dividió 1 polígono.',
  'toast.splitDone.other': 'Se dividieron {count} polígonos.',
  'toast.splitNone': 'La línea no cortó limpiamente el polígono seleccionado.',
  'toast.splitSelect': 'Primero seleccione el polígono que quiere dividir.',
  'toast.cutNothing': 'Esa forma no se superpone con ningún polígono, así que no se recortó nada.',
  'toast.undoHint': '{message} Ctrl+Z lo deshace.',
  'toast.smoothNothing': 'No hay nada que suavizar con esa tolerancia.',
  'toast.bulkApplied.one': 'Se aplicó {columns} a 1 lote.',
  'toast.bulkApplied.other': 'Se aplicó {columns} a {count} lotes.',
  'toast.flagsWithoutPolygons':
    'Esas alertas son sobre filas de lotes, no sobre polígonos del mapa.',

  'note.unsupported': '{file}: tipo de archivo no admitido (se aceptan .kml, .kmz, .zip, .geojson y .json).',
  'note.badKml': 'el KML no es un XML bien formado.',
  'note.noKmlInArchive': 'no se encontró ningún archivo .kml dentro del paquete.',
  'note.mergedKml': '{file}: se combinaron {count} documentos KML del paquete.',
  'note.noPrj': '{file}: no se encontró un .prj — las coordenadas se leyeron como WGS84. Verifique el resultado en el mapa.',
  'note.alreadyWgs84': '{file}: ya está en WGS84 ({crs}).',
  'note.reprojected': '{file}: reproyectado de {crs} a WGS84.',
  'note.needShp': 'hace falta un archivo .shp junto con las demás partes del shapefile.',
  'note.noDbf': '{file}: no se seleccionó un .dbf, así que no se trajo ningún atributo.',
  'note.badPrj': '{file}: no se pudo leer el .prj; se asumió que las coordenadas están en WGS84.',
  'note.noPrjSelected': '{file}: no se seleccionó un .prj — las coordenadas se leyeron como WGS84.',
  'note.epsgUnsupported': '{file}: declara EPSG:{code}, que esta herramienta no puede convertir sin conexión. Vuelva a exportar el archivo como WGS84 (EPSG:4326) o como shapefile comprimido con .prj.',
  'note.epsgFailed': '{file}: no se pudo inicializar EPSG:{code}.',
  'note.outOfRange': '{file}: las coordenadas caen fuera del rango válido de longitud/latitud y el archivo no declara CRS, así que no se puede ubicar en el mapa. Vuelva a exportarlo como WGS84.',
  'note.noPolygons': '{file}: no se encontraron polígonos (los puntos y las líneas no pueden ser lotes).',
  'note.skipped.one': '{file}: se omitió 1 entidad no poligonal.',
  'note.skipped.other': '{file}: se omitieron {count} entidades no poligonales.',
  'note.degenerate.one': '{file}: se descartó 1 polígono vacío o degenerado.',
  'note.degenerate.other': '{file}: se descartaron {count} polígonos vacíos o degenerados.',
  'join.parentheses': 'Nombre (extra)',
  'join.dash': 'Nombre - extra',
  'join.space': 'Nombre extra',
  'join.prefix': 'extra - Nombre',

  'toast.bulkFixed.one': 'Se corrigió 1 problema.',
  'toast.bulkFixed.other': 'Se corrigieron {count} problemas.',
  'toast.bulkSkipped.one': ' 1 superposición todavía necesita que usted elija qué lote se queda con el área compartida.',
  'toast.bulkSkipped.other': ' {count} superposiciones todavía necesitan que usted elija qué lote se queda con el área compartida.',
  'toast.bulkNothingFixed': 'Ninguno de los problemas seleccionados tiene corrección automática.',
  'toast.bulkReviewed.one': 'Se marcó 1 aviso como revisado.',
  'toast.bulkReviewed.other': 'Se marcaron {count} avisos como revisados.',

  'smoothing.title': 'Vista previa del suavizado',
  'smoothing.label': 'Suavizado',
  'smoothing.guidance':
    'Los contornos calcados de imágenes satelitales o registrados por GPS llevan muchos más ' +
    'vértices de los que la forma necesita. El suavizado quita el ruido sin mover el contorno ' +
    'más allá de la tolerancia que usted fije. El trazo punteado es el resultado; no se ' +
    'confirma nada hasta que lo aplique.',
  'smoothing.tolerance': 'Tolerancia de suavizado en metros',
  'smoothing.vertices': 'Vértices',
  'smoothing.removed': 'Quitados',
  'smoothing.areaChange': 'Cambio de área',
  'smoothing.apply': 'Aplicar suavizado',
  'smoothing.cancel': 'Cancelar',
  'smoothing.verticesValue': 'de {before} a {after}',

  'fix.repaired.one': 'Se reparó 1 polígono',
  'fix.repaired.other': 'Se repararon {count} polígonos',
  'fix.and': ' y ',
  'fix.dropped': 'se quitaron {count} que no se pudieron reparar',
  'fix.deletedSlivers.one': 'Se eliminó 1 astilla.',
  'fix.deletedSlivers.other': 'Se eliminaron {count} astillas.',
  'fix.smoothed': 'Suavizado a {tolerance} m: {before} vértices reducidos a {after}.',
  'fix.clipped': 'Se recortó el área compartida del otro lote.',
  'fix.clippedRemoved.one': ' 1 polígono estaba completamente dentro del lote conservado y se quitó.',
  'fix.clippedRemoved.other':
    ' {count} polígonos estaban completamente dentro del lote conservado y se quitaron.',
  'fix.noOverlap': 'No hay nada que recortar: la superposición ya no estaba.',
  'fix.noKeeper': 'El lote que se conserva no tiene geometría.',
  'fix.renamed.one': 'Se renombró 1 lote para que cada combinación sea única.',
  'fix.renamed.other': 'Se renombraron {count} lotes para que cada combinación sea única.',
  'fix.shortened.one': 'Se acortó 1 nombre a {limit} caracteres.',
  'fix.shortened.other': 'Se acortaron {count} nombres a {limit} caracteres.',
  'fix.shortenedCollided': ' Dos de ellos coincidieron entonces, así que se numeraron aparte.',
  'fix.alreadyFits': 'Todos los nombres ya entran.',
};
