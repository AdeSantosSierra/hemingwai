import hashlib
from datetime import datetime
import re
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi


class Utils:

    criterios = {
        1: {
            "nombre": "Interpretación del periodista",
            "instruccion": "Analiza si hay interpretaciones explícitas del periodista. Si aparecen interpretaciones explícitas del periodista, puntúa negativa y proporcionalmente a cuántas haya. Si no hay interpretaciones explícitas en el texto, puntúa positivamente. Las interpretaciones explícitas aparecen en el texto reflejadas como adjetivos calificativos, verbos cargados de connotaciones mayormente negativas o hiperbólicas y afirmaciones tendenciosas con tópicos, categorizaciones."
        },
        2: {
            "nombre": "Opiniones",
            "instruccion": "Identifica y contabiliza las opiniones explícitas del periodista. Si hay opiniones explícitas del periodista, señala concretamente cuántas y cuáles en la columna de justificación y razones y puntúa negativamente. Si no hay opiniones explícitas puntúa positivamente."
        },
        3: {
            "nombre": "Cita de fuentes",
            "instruccion": "Evalúa la citación de fuentes. Si el periodista cita la fuente antes o después de hacer una afirmación sobre una información puntúa positivamente, si no hay cita, puntúa negativamente y señala en qué parte del texto hay ausencia de esa cita o citas donde debería haberla. Si el periodista no cita ninguna fuente en toda la noticia, puntuar negativamente e indicarlo en la justificación o razón. Si cita, al menos, dos o tres fuentes, puntuar positivamente."
        },
        4: {
            "nombre": "Confiabilidad de las fuentes",
            "instruccion": "Analiza la confiabilidad de las fuentes citadas. Si la fuente que cita resulta confiable y adecuada para la afirmación o información que se está dando, puntuar positivamente, si no, puntuar negativamente, señalarlo y expresar dónde y en qué afirmación literal la cita o citas no son confiables y por qué no lo son en la categoría de justificación."
        },
        5: {
            "nombre": "Trascendencia",
            "instruccion": "el acontecimiento o acción humana o de la naturaleza que relata la noticia es importante porque sus consecuencias afectan a la vida de las personas siendo 0 muy poco trascendente y 10 muy trascendente. Para establecer el criterio de trascendencia se ha de tener en cuenta el bien o el mal humano que generan las consecuencias del acontecimiento relatado. De esta manera, el acontecimiento con mayor trascendencia será el que mayor bien o mayor mal cause al mayor número de personas según su naturaleza humana, anhelos y aspiraciones vitales de felicidad, plenitud y de alcanzar el bien mayor. La evaluación deberás hacerla atendiendo al público al que podría ir dirigida esa noticia y al bien común que supone para la sociedad o el público objetivo conocer esa noticia. Señala la razón o justificación concreta que te lleva a evaluar la noticia como trascendente o intrascendente."
        },
        6: {
            "nombre": "Relevancia de los datos",
            "instruccion": "Relevancia de los datos proporcionados en el relato noticioso. Hay que evaluar si los datos elegidos son los más relevantes del acontecimiento de entre todos los que se podrían escoger señalando en la columna de la justificación las ausencias de datos importantes que puedan faltar en la noticia."
        },
        7: {
            "nombre": "Precisión y claridad",
            "instruccion": "Evalúa la precisión y claridad de los conceptos y palabras utilizadas. Se puntúa positivamente si las palabras utilizadas son las más adecuadas y negativamente si las palabras o proposiciones son poco precisas para relatar el acontecimiento o si tienen un significado ambiguo. Ten en cuenta si hay un lenguaje muy técnico o por el contrario hay un estilo de escritura claro y conciso para que los lectores puedan entender fácilmente la información."
        },
        8: {
            "nombre": "Enfoque",
            "instruccion": "Valora si los aspectos destacados son adecuados para comprender el acontecimiento. Puntúa positivamente si el aspecto o aspectos del acontecimiento del que se informa son los adecuados para comprender lo que ha ocurrido o si no lo son. En el caso de no serlo, expresa en la columna de justificación de tu evaluación cuál sería un mejor enfoque o que podría haberse destacado para que el enfoque fuera menos parcial."
        },
        9: {
            "nombre": "Contexto",
            "instruccion": "Verifica si la noticia proporciona contexto suficiente mediante párrafos introductorios, aclaraciones o complementos informativos. Puntúa positivamente si hay un Tie-in o párrafo de contexto al principio o al final de la noticia o aparecen aclaraciones pertinentes cuando es necesario contextualizar algún aspecto del acontecimiento y puntúa negativamente si la noticia carece de ellos."
        },
        10: {
            "nombre": "Ética",
            "instruccion": "Examina si la noticia respeta la privacidad, dignidad y derechos humanos. Puntúa positivamente si la noticia respeta la privacidad, la dignidad, los derechos humanos de las personas involucradas en las noticias y los lectores que la van a recibir y puntúa negativamente si hay ausencia de todo ello o difamación, calumnia y sensacionalismo. Señala en las observaciones y comentarios dónde se hacen esos ataques en la noticia si es que los hubiere. Finalmente haz un sumatorio de la evaluación final en la última fila de la tabla."
        }
    }

    # Función para codificar la URL en sha256
    @staticmethod
    def codificar_url_sha256(url):
        return hashlib.sha256(url.encode('utf-8')).hexdigest()
    
    # Función para obtener la fecha y hora actual en formato ISO
    @staticmethod
    def obtener_fecha_hora_actual_iso():
        return datetime.now().isoformat()
    
    @staticmethod
    def generar_salida_claude(cliente_anthropic, titulo, noticia, nombre_criterio, instruccion_criterio):
        instruccion = f"""
        Para esta noticia titulada:
        Título: {titulo}
        Noticia: {noticia}

        Clasifícala cualitativamente (Óptima, Positiva, Regular, Negativa, Desinformativa) en base a la siguiente 
        instrucción y justifica tu decisión escribiendo en qué partes del texto te basas para tomar estas conclusiones.  
        Menciona las áreas a mejorar y justifica detalladamente tu respuesta: 
        '{nombre_criterio}': {instruccion_criterio}

        INDICACIONES DE ESTILO Y ENFOQUE PARA LA SALIDA O OUTPUT DE RESPUESTA AL ANÁLISIS 
        Para mostrar la expresión de tu salida tras el análisis de la noticia evita: 
        1. Argumentar con el cumplimiento de estándares éticos y profesionales del periodismo. Nuestro análisis es fundamentalmente epistemológico y huye en gran medida, aunque lo tiene en cuenta, de argumentar sobre cumplimientos de estándares éticos y profesionales, muy discutibles por otro lado. 
        2. La conclusión debe citar, al menos, la afirmación o informaciones más relevantemente incorrectas más relevante de las que aparecen en la noticia y la más dañina de todas y no lanzar adjetivos calificativos para mostrar sus errores o aciertos. La fórmula de respuesta sobre la redacción sería: “incorrectas como por ejemplo” 
        3. El outpout o respuesta de salida debe evitar hacer juicios morales sobre el trabajo del periodista o redactor. Se señala el error, cómo hacerlo adecuadamente o se sugieren mejoras. Y para ello, la conclusión debe argumentarse sobre hechos y datos y dar ejemplos respecto de lo que critica. 
        4. La noticia es desinformativa porque ofrece datos y/o declaraciones falsas, contiene interpretaciones explícitas sin fundamento en la realidad, datos insuficientes, irrelevantes y descontextualizadores que deforman la realidad y desinforman al público. 
        Para responder, evitar utilizar expresiones cómo: 
        La veracidad o imparcialidad, nunca neutralidad porque la verdad no es neutral. 
        Evitar hablar de lenguaje neutral. Solo se habla de lenguaje imparcial, ecuánime o adecuado. 
        Evitar expresiones como “noticias objetivas”. Mejor utilizar relatos veraces y noticias verdaderas.  
        Usar expresiones como “fundadas en hechos o datos que “factual” 
        Evita el uso de expresiones como: “hechos verficables”. Eso es una redundancia. Utilizar solo la expresión o palabra “Hechos” o “datos” es suficiente. 
        ¡MUY IMPORTANTE! Evita las expresiones “hecho objetivo”, “dato objetivo” “interpretación subjetiva”, “verdad objetiva”, “neutral”. Utilizar, en cambio solo “hecho”, “dato”, “interpretación”, “verdad”, “imparcial”, “ecuánime”, “adecuado”. 

        Ejemplos de salida pueden ser:
        1º La noticia es sobresaliente porque ofrece un relato ordenado y veraz en el que las afirmaciones del periodista
        están sustentadas en datos y/o declaraciones relevantes y suficientes para la comprensión del acontecimiento.
        2º La noticia es aceptable porque ofrece datos y declaraciones ciertas pero insuficientes para una contextualización 
        y comprensión adecuada del acontecimiento.
        3º La noticia es deficiente porque ofrece interpretaciones explícitas y afirmaciones sesgadas del periodista sin 
        fundamento en los datos de la realidad, ofrece datos y declaraciones irrelevantes que descontextualizan la 
        relevancia y comprensión del acontecimiento.
        4º La noticia es desinformativa porque ofrece datos y/o declaraciones falsas, contiene interpretaciones explícitas 
        sin fundamento en la realidad, datos insuficientes, irrelevantes y descontextualizadores que deforman la realidad y 
        desinforman al público. 
        """

        return cliente_anthropic.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=1024,
            messages=[{"role": "user", "content": instruccion}]
        ).content

    @staticmethod
    def generar_salida_gpt(cliente_openai, titulo, noticia, salida_claude, nombre_criterio, instruccion_criterio):
        instruccion = f"""
        Para esta noticia titulada:
        Título: {titulo}
        Noticia: {noticia}

        Y con estas conclusiones:
        {salida_claude}

        Clasifícala cualitativamente (Óptima, Positiva, Regular, Negativa, Desinformativa) en base a la siguiente 
        instrucción.
        Menciona las áreas a mejorar y justifica detalladamente tu respuesta: 
        '{nombre_criterio}': {instruccion_criterio}

        INDICACIONES DE ESTILO Y ENFOQUE PARA LA SALIDA O OUTPUT DE RESPUESTA AL ANÁLISIS 
        Para mostrar la expresión de tu salida tras el análisis de la noticia evita: 
        1. Argumentar con el cumplimiento de estándares éticos y profesionales del periodismo. Nuestro análisis es fundamentalmente epistemológico y huye en gran medida, aunque lo tiene en cuenta, de argumentar sobre cumplimientos de estándares éticos y profesionales, muy discutibles por otro lado. 
        2. La conclusión debe citar, al menos, la afirmación o informaciones más relevantemente incorrectas más relevante de las que aparecen en la noticia y la más dañina de todas y no lanzar adjetivos calificativos para mostrar sus errores o aciertos. La fórmula de respuesta sobre la redacción sería: “incorrectas como por ejemplo” 
        3. El outpout o respuesta de salida debe evitar hacer juicios morales sobre el trabajo del periodista o redactor. Se señala el error, cómo hacerlo adecuadamente o se sugieren mejoras. Y para ello, la conclusión debe argumentarse sobre hechos y datos y dar ejemplos respecto de lo que critica. 
        4. La noticia es desinformativa porque ofrece datos y/o declaraciones falsas, contiene interpretaciones explícitas sin fundamento en la realidad, datos insuficientes, irrelevantes y descontextualizadores que deforman la realidad y desinforman al público. 
        Para responder, evitar utilizar expresiones cómo: 
        La veracidad o imparcialidad, nunca neutralidad porque la verdad no es neutral. 
        Evitar hablar de lenguaje neutral. Solo se habla de lenguaje imparcial, ecuánime o adecuado. 
        Evitar expresiones como “noticias objetivas”. Mejor utilizar relatos veraces y noticias verdaderas.  
        Usar expresiones como “fundadas en hechos o datos que “factual” 
        Evita el uso de expresiones como: “hechos verficables”. Eso es una redundancia. Utilizar solo la expresión o palabra “Hechos” o “datos” es suficiente. 
        ¡MUY IMPORTANTE! Evita las expresiones “hecho objetivo”, “dato objetivo” “interpretación subjetiva”, “verdad objetiva”, “neutral”. Utilizar, en cambio solo “hecho”, “dato”, “interpretación”, “verdad”, “imparcial”, “ecuánime”, “adecuado”. 

        Ejemplos de salida pueden ser:
        1º La noticia es sobresaliente porque ofrece un relato ordenado y veraz en el que las afirmaciones del periodista
        están sustentadas en datos y/o declaraciones relevantes y suficientes para la comprensión del acontecimiento.
        2º La noticia es aceptable porque ofrece datos y declaraciones ciertas pero insuficientes para una contextualización 
        y comprensión adecuada del acontecimiento.
        3º La noticia es deficiente porque ofrece interpretaciones explícitas y afirmaciones sesgadas del periodista sin 
        fundamento en los datos de la realidad, ofrece datos y declaraciones irrelevantes que descontextualizan la 
        relevancia y comprensión del acontecimiento.
        4º La noticia es desinformativa porque ofrece datos y/o declaraciones falsas, contiene interpretaciones explícitas 
        sin fundamento en la realidad, datos insuficientes, irrelevantes y descontextualizadores que deforman la realidad y 
        desinforman al público. 
        """

        response = cliente_openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Eres un analista experto en noticias."},
                {"role": "user", "content": instruccion}
            ],
            temperature=0.7
        )

        return response.choices[0].message.content
    
    @staticmethod
    def analizar_noticia(cliente_anthropic, cliente_openai, titulo, noticia):
        resultados = {}
        for key, criterio in Utils.criterios.items():
            nombre_criterio = criterio["nombre"]
            instruccion_criterio = criterio["instruccion"]
            iteraciones = 0
            max_iteraciones = 3
            consenso = False
            historial = []
            salida_claude = Utils.generar_salida_claude(cliente_anthropic, titulo, noticia, nombre_criterio, instruccion_criterio)
            salida_gpt = Utils.generar_salida_gpt(cliente_openai, titulo, noticia, salida_claude, nombre_criterio, instruccion_criterio)
            historial.append({
                "iteracion": 1,
                "rol": "Claude",
                "contenido": salida_claude
            })
            historial.append({
                "iteracion": 1,
                "rol": "ChatGPT",
                "contenido": salida_gpt
            })
            while iteraciones < max_iteraciones and not consenso:
                iteraciones += 1
                historial_completo = "\n".join(
                    [f"{item['rol']} (Iteración {item['iteracion']}): {item['contenido']}" for item in historial]
                )
                evaluacion_claude = cliente_anthropic.messages.create(
                    model="claude-3-haiku-20240307",
                    max_tokens=1024,
                    messages=[{"role": "user", "content": f"""
                    Basándote en este historial de interacción:
                    {historial_completo}

                    Evalúa la respuesta más reciente de ChatGPT sobre el criterio '{nombre_criterio}' para la noticia titulada: {titulo}.
                    Justifica si es adecuada para aprobarla o si necesita mejoras. 
                    Si necesita mejoras, sugiere cambios específicos que ChatGPT debe implementar.
                    """}]
                ).content
                historial.append({
                    "iteracion": iteraciones,
                    "rol": "Claude",
                    "contenido": evaluacion_claude
                })
                mejora_gpt_instruccion = f"""
                Mejora tu respuesta sobre la noticia titulada: {titulo}, basándote en esta evaluación realizada por Claude:
                {evaluacion_claude}

                Respuesta anterior de ChatGPT: {historial[-2]['contenido']}
                """
                salida_gpt_mejorada = cliente_openai.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "Eres un analista experto en noticias."},
                        {"role": "user", "content": mejora_gpt_instruccion}
                    ]
                ).choices[0].message.content
                historial.append({
                    "iteracion": iteraciones,
                    "rol": "ChatGPT",
                    "contenido": salida_gpt_mejorada
                })
                if isinstance(evaluacion_claude, list):
                    evaluacion_claude = " ".join(
                        str(item.content) if hasattr(item, 'content') else str(item) for item in evaluacion_claude
                    )
                if isinstance(evaluacion_claude, str) and re.search(r'\b(aprobada|adecuada)\b', evaluacion_claude, flags=re.IGNORECASE):
                    consenso = True
                    resultados[key] = salida_gpt_mejorada
                else:
                    salida_gpt = salida_gpt_mejorada
            if not consenso:
                resultados[key] = {
                    "mensaje": "No se alcanzó consenso tras múltiples iteraciones.",
                    "historial": historial
                }
        return resultados
    
    @staticmethod
    def obtener_puntuacion_final(cliente_openai, titulo, noticia, resultado_final):
        instruccion = f"""
        Considera la siguiente noticia:
        Título: {titulo}
        Noticia: {noticia}

        Y la valoración final:
        {resultado_final}

        Asigna una puntuación numérica entre 1 y 100 a la calidad informativa de la noticia, donde 1 es la más baja y 100 la más alta.
        Responde únicamente con el número.
        """

        response = cliente_openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Eres un analista experto en noticias."},
                {"role": "user", "content": instruccion}
            ],
            temperature=0  # importante para respuestas más consistentes al pedir solo un número
        )

        respuesta = response.choices[0].message.content
        match = re.search(r'\b(\d{1,3})\b', respuesta)
        if match:
            return int(match.group(1))
        return None
    
    @staticmethod
    def generar_texto_referencia(cliente_openai, titulo, noticia, valoracion):
        prompt = f"""
        Considera la siguiente noticia:
        Título: {titulo}
        Noticia: {noticia}

        Y la valoración obtenida:
        {valoracion}

        Registra la siguiente instrucción:
        Justifica la valoración escribiendo en qué partes del texto se basa para tomar esas conclusiones. Escribe la  
        valoración específica por una parte y el fragmento de la noticia a la que hace referencia por otra, unidos por "|", 
        los fragmentos de la noticia escríbelos entre corchetes []. Quiero que la respuesta que me proporciones no contenga 
        nada más que lo que se requiere, sin palabras adicionales. 
        """

        response = cliente_openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Eres un analista experto en noticias."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3  # Leve creatividad pero controlada
        )

        return response.choices[0].message.content
    
    @staticmethod
    def obtener_valoracion_general(openai_client, titulo, noticia, valoraciones_texto):
        """
        Toma el diccionario de valoraciones y solicita a ChatGPT una breve síntesis que
        genere una valoración general de la noticia.
        """
        prompt = "Para las siguientes valoraciones obtenidas:\n\n"
        for key, valoracion in valoraciones_texto.items():
            prompt += f"{key}: {valoracion}\n"
        prompt += (
            f"""
            Realiza una breve síntesis de lo anterior para generar una valoración general de la noticia {noticia} titulada 
            '{titulo}'. La valoración debe resumir los puntos clave y ser concisa."""
        )

        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Eres un experto en análisis de noticias."},
                {"role": "user", "content": prompt}
            ]
        )
        return response.choices[0].message.content.strip()
    
    @staticmethod
    def crear_diccionario_citas(texto_referencia):
        """
        Recibe un texto de referencia en el que cada línea contiene una valoración a la izquierda
        del símbolo '|' y fragmentos de la noticia (dentro de corchetes []) a la derecha.
        Extrae cada fragmento y lo asocia a la valoración correspondiente en un diccionario.

        Ejemplo de entrada:
        "La noticia presenta interpretaciones subjetivas... objetiva. | [\"Fragmento 1\"], [\"Fragmento 2\"]"

        Devuelve:
        {
            "Fragmento 1": "La noticia presenta interpretaciones subjetivas... objetiva.",
            "Fragmento 2": "La noticia presenta interpretaciones subjetivas... objetiva."
        }
        """
        diccionario_citas = {}

        # Se separa el texto en líneas, en caso de que sean varias entradas
        lineas = texto_referencia.splitlines()

        for linea in lineas:
            linea = linea.strip()
            if not linea or '|' not in linea:
                continue  # Omitir líneas vacías o sin el separador

            # Se separa la valoración (izquierda) de los fragmentos (derecha)
            valoracion, fragmentos_str = linea.split('|', 1)
            valoracion = valoracion.strip()
            # Eliminar el número y punto inicial si existe
            valoracion = re.sub(r'^\d+\.\s*', '', valoracion)

            # Se extraen los fragmentos que están entre corchetes []
            fragmentos = re.findall(r'\[(.*?)\]', fragmentos_str)
            for fragmento in fragmentos:
                # Se limpian posibles comillas y espacios adicionales
                fragmento_limpio = fragmento.strip().strip('"').strip("'")
                diccionario_citas[fragmento_limpio] = valoracion

        return diccionario_citas

    @staticmethod
    def convertir_markdown_a_html(markdown_input):
        # Si se recibe un diccionario, se recorre cada par clave/valor
        if isinstance(markdown_input, dict):
            resultado = {}
            for key, value in markdown_input.items():
                resultado[key] = Utils.convertir_markdown_a_html(value)
            return resultado

        # Si es un string, se procesa normalmente.
        markdown_text = markdown_input

        # Preprocesamiento: unir líneas de listas ordenadas separadas por líneas en blanco
        markdown_text = re.sub(r'\n\s*\n(?=\d+\.\s+)', '\n', markdown_text)

        # Bloques de código (triple backticks)
        def sustituir_bloque_codigo(match):
            code = match.group(3)
            return f'<pre><code>{code}</code></pre>'

        markdown_text = re.sub(r'(^|\n)```(\w*\n)(.*?)```', sustituir_bloque_codigo, markdown_text, flags=re.DOTALL)
        markdown_text = re.sub(r'(^|\n)```(.*?)```', sustituir_bloque_codigo, markdown_text, flags=re.DOTALL)

        # Encabezados: líneas que comienzan con uno o más '#' seguidos de espacio
        def sustituir_encabezado(match):
            nivel = len(match.group(1))
            contenido = match.group(2).strip()
            return f'<h{nivel}>{contenido}</h{nivel}>'

        markdown_text = re.sub(r'^(#{1,6})\s+(.*)$', sustituir_encabezado, markdown_text, flags=re.MULTILINE)

        # Líneas horizontales: tres o más guiones o asteriscos en una línea
        markdown_text = re.sub(r'\n(?:\s*)([-\*])(?:\s*\1){2,}\s*\n', '\n<hr>\n', markdown_text)

        # Citas: líneas que comienzan con ">"
        def sustituir_cita(match):
            contenido = match.group(0).lstrip('> ').strip()
            return f'<blockquote>{contenido}</blockquote>'

        markdown_text = re.sub(r'^(>\s?.+)$', sustituir_cita, markdown_text, flags=re.MULTILINE)

        # Listas desordenadas: líneas que comienzan con -, + o *
        def procesar_lista_desordenada(text):
            items = re.split(r'\n(?=[\-\+\*]\s+)', text)
            html_items = []
            for item in items:
                item = re.sub(r'^[\-\+\*]\s+', '', item)
                html_items.append(f'<li>{item.strip()}</li>')
            return '<ul>' + ''.join(html_items) + '</ul>'

        markdown_text = re.sub(
            r'((?:^[\-\+\*]\s+.*(?:\n|$))+)',
            lambda m: procesar_lista_desordenada(m.group(1)),
            markdown_text, flags=re.MULTILINE
        )

        # Listas ordenadas: líneas que comienzan con dígitos seguidos de punto.
        def procesar_lista_ordenada(text):
            items = re.split(r'\n(?=\d+\.\s+)', text)
            html_items = []
            for item in items:
                item = re.sub(r'^\d+\.\s+', '', item)
                html_items.append(f'<li>{item.strip()}</li>')
            return '<ol>' + ''.join(html_items) + '</ol>'

        markdown_text = re.sub(
            r'((?:^\d+\.\s+.*(?:\n|$))+)',
            lambda m: procesar_lista_ordenada(m.group(1)),
            markdown_text, flags=re.MULTILINE
        )

        # Tablas simples: cabecera, separador y filas
        def procesar_tabla(match):
            cabecera = match.group(1).strip()
            filas = match.group(3).strip().split('\n')
            headers = [cell.strip() for cell in cabecera.split('|') if cell.strip()]
            html = '<table><thead><tr>'
            for h in headers:
                html += f'<th>{h}</th>'
            html += '</tr></thead><tbody>'
            for fila in filas:
                celdas = [cell.strip() for cell in fila.split('|') if cell.strip()]
                if celdas:
                    html += '<tr>' + ''.join(f'<td>{celda}</td>' for celda in celdas) + '</tr>'
            html += '</tbody></table>'
            return html

        markdown_text = re.sub(
            r'((?:.*\|.*\n)+)(\s*\|?(?:\s*:?-+:?\s*\|)+\s*\n)((?:.*\|.*\n?)*)',
            procesar_tabla,
            markdown_text
        )

        # Código en línea: `código`
        markdown_text = re.sub(r'`([^`]+)`', r'<code>\1</code>', markdown_text)

        # Enlaces: [texto](url)
        markdown_text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', markdown_text)

        # Imágenes: ![alt](url)
        markdown_text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', r'<img src="\2" alt="\1">', markdown_text)

        # Negrita: **texto** o __texto__
        markdown_text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', markdown_text)
        markdown_text = re.sub(r'__(.*?)__', r'<strong>\1</strong>', markdown_text)

        # Cursiva: *texto* o _texto_
        markdown_text = re.sub(r'\*(?!\*)(.*?)\*(?!\*)', r'<em>\1</em>', markdown_text)
        markdown_text = re.sub(r'_(?!_)(.*?)_(?!_)', r'<em>\1</em>', markdown_text)

        # Saltos de línea forzados: dos espacios al final de la línea
        markdown_text = re.sub(r'  \n', '<br>\n', markdown_text)

        # Envolver líneas que no sean etiquetas en párrafos
        lineas = markdown_text.split('\n')
        resultado = []
        buffer_parrafo = []

        def flush_parrafo():
            nonlocal buffer_parrafo, resultado
            if buffer_parrafo:
                parrafo = ' '.join(buffer_parrafo).strip()
                if parrafo:
                    resultado.append(f'<p>{parrafo}</p>')
                buffer_parrafo = []

        for linea in lineas:
            linea_strip = linea.strip()
            # Línea vacía: cierra párrafo
            if not linea_strip:
                flush_parrafo()
                continue
            # Si la línea ya es una etiqueta HTML completa, se añade directamente
            if re.match(r'^<\/?(h\d|ul|ol|li|blockquote|pre|table|tr|td|th|img|hr|code)', linea_strip):
                flush_parrafo()
                resultado.append(linea_strip)
            else:
                buffer_parrafo.append(linea_strip)
        flush_parrafo()

        return '\n'.join(resultado)

    @staticmethod
    def sanitize(obj):
        """
        reemplaza puntos en claves por guiones bajos y fuerza valores a tipos básicos
        """
        if isinstance(obj, dict):
            out = {}
            for k, v in obj.items():
                safe_k = k.replace('.', '_')
                out[safe_k] = Utils.sanitize(v)
            return out
        if isinstance(obj, list):
            return [Utils.sanitize(v) for v in obj]
        if not isinstance(obj, (str, int, float, bool, type(None))):
            return str(obj)
        return obj
    

    # Funciones para analizar el titular (evaluar si es adecuado o clickbait)
    @staticmethod
    def generar_salida_claude_titular(cliente_anthropic, titular, nombre_criterio, instruccion_criterio):
        instruccion = f"""
        Para este titular:
        Titular: {titular}

        {instruccion_criterio}
        """
        return cliente_anthropic.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=1024,
            messages=[{"role": "user", "content": instruccion}]
        ).content

    @staticmethod
    def generar_salida_gpt_titular(cliente_openai, titular, salida_claude, nombre_criterio, instruccion_criterio):
        instruccion = f"""
        Para este titular:
        Titular: {titular}

        Y con estas conclusiones:
        {salida_claude}

        {instruccion_criterio}
        """
        return cliente_openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Eres un analista experto en titulares de noticias."},
                {"role": "user", "content": instruccion}
            ]
        ).choices[0].message.content

    @staticmethod
    def analizar_titular(cliente_anthropic, cliente_openai, titular):
        resultados = {}
        criterio = {
            "nombre": "Evaluación del titular",
            "instruccion": "Analiza si el titular es adecuado en cuanto a veracidad, claridad y relevancia o si resulta ser clickbait. Puntúa negativamente en proporción a su grado de clickbait y positivamente si es adecuado."
        }
        nombre_criterio = criterio["nombre"]
        instruccion_criterio = criterio["instruccion"]

        iteraciones = 0
        max_iteraciones = 3
        consenso = False
        historial = []
        titular_reformulado = None

        salida_claude = Utils.generar_salida_claude_titular(
            cliente_anthropic, titular, nombre_criterio, instruccion_criterio
        )
        salida_gpt = Utils.generar_salida_gpt_titular(
            cliente_openai, titular, salida_claude, nombre_criterio, instruccion_criterio
        )

        historial.append({
            "iteracion": 1,
            "rol": "Claude",
            "contenido": salida_claude
        })
        historial.append({
            "iteracion": 1,
            "rol": "ChatGPT",
            "contenido": salida_gpt
        })

        while iteraciones < max_iteraciones and not consenso:
            iteraciones += 1
            historial_completo = "\n".join(
                [f"{item['rol']} (Iteración {item['iteracion']}): {item['contenido']}" for item in historial]
            )

            evaluacion = cliente_anthropic.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": f"""
                    Basándote en este historial de interacción:
                    {historial_completo}

                    Evalúa la respuesta más reciente de ChatGPT sobre el criterio '{nombre_criterio}': {instruccion_criterio} para el titular: {titular}.
                    Justifica si es adecuada para aprobarla o si necesita mejoras.
                    Si está aprobada, escribe explícita y obligatoriamente la palabra "Aprobada". 
                    Si la rechazas porque detectas clickbait, sugiere cambios específicos e incluye una versión alternativa del titular libre de clickbait con el siguiente formato:

                    TITULO PROPUESTO: <tu versión alternativa aquí>
                    """
                }]
            )

            evaluacion_claude = evaluacion.content

            if isinstance(evaluacion_claude, list):
                evaluacion_claude = " ".join(part.text for part in evaluacion_claude if hasattr(part, "text"))
            elif hasattr(evaluacion_claude, "text"):
                evaluacion_claude = evaluacion_claude.text

            historial.append({
                "iteracion": iteraciones,
                "rol": "Claude",
                "contenido": evaluacion_claude
            })

            mejora_gpt_instruccion = f"""
            Mejora tu respuesta sobre el titular: {titular}, basándote en esta evaluación realizada por Claude:
            {evaluacion_claude}

            Respuesta anterior de ChatGPT: {historial[-2]['contenido']}
            Si Claude ha sugerido que el titular es clickbait, incluye también una versión alternativa libre de clickbait usando el siguiente formato:
            TITULO PROPUESTO: <tu propuesta aquí>
            """

            salida_gpt_mejorada = cliente_openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "Eres un analista experto en noticias."},
                    {"role": "user", "content": mejora_gpt_instruccion}
                ]
            ).choices[0].message.content

            historial.append({
                "iteracion": iteraciones,
                "rol": "ChatGPT",
                "contenido": salida_gpt_mejorada
            })

            # Buscar título propuesto en cualquiera de las respuestas más recientes
            if not titular_reformulado:
                # Primero intentar con la evaluación de Claude
                match = re.search(r'TITULO PROPUESTO:\s*(.+)', evaluacion_claude)
                if not match:
                    # Si no hay coincidencia en Claude, intentar con GPT
                    match = re.search(r'TITULO PROPUESTO:\s*(.+)', salida_gpt_mejorada)

                if match:
                    titular_reformulado = match.group(1).strip()

            if isinstance(evaluacion_claude, str) and re.search(r'\bAprobada\b', evaluacion_claude, flags=re.IGNORECASE):
                consenso = True
                resultados["titular"] = salida_gpt_mejorada
            else:
                salida_gpt = salida_gpt_mejorada

        resultados["historial"] = historial

        if titular_reformulado:
            resultados["titular_reformulado"] = titular_reformulado
        elif not consenso:
            resultados["mensaje"] = "No se alcanzó consenso tras múltiples iteraciones."

        return resultados
    


