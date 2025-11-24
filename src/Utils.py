import hashlib
from datetime import datetime
import re
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import numpy as np  # Asegúrate de tener numpy instalado: pip install numpy


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
        2. La conclusión debe citar, al menos, la afirmación o informaciones más relevantemente incorrectas más relevante de las que aparecen en la noticia y la más dañina de todas y no lanzar adjetivos calificativos para mostrar sus errores o aciertos. La fórmula de respuesta sobre la redacción sería: "incorrectas como por ejemplo" 
        3. El outpout o respuesta de salida debe evitar hacer juicios morales sobre el trabajo del periodista o redactor. Se señala el error, cómo hacerlo adecuadamente o se sugieren mejoras. Y para ello, la conclusión debe argumentarse sobre hechos y datos y dar ejemplos respecto de lo que critica. 
        4. La noticia es desinformativa porque ofrece datos y/o declaraciones falsas, contiene interpretaciones explícitas sin fundamento en la realidad, datos insuficientes, irrelevantes y descontextualizadores que deforman la realidad y desinforman al público. 
        Para responder, evitar utilizar expresiones cómo: 
        La veracidad o imparcialidad, nunca neutralidad porque la verdad no es neutral. 
        Evitar hablar de lenguaje neutral. Solo se habla de lenguaje imparcial, ecuánime o adecuado. 
        Evitar expresiones como "noticias objetivas". Mejor utilizar relatos veraces y noticias verdaderas.  
        Usar expresiones como "fundadas en hechos o datos que "factual" 
        Evita el uso de expresiones como: "hechos verficables". Eso es una redundancia. Utilizar solo la expresión o palabra "Hechos" o "datos" es suficiente. 
        ¡MUY IMPORTANTE! Evita las expresiones "hecho objetivo", "dato objetivo" "interpretación subjetiva", "verdad objetiva", "neutral". Utilizar, en cambio solo "hecho", "dato", "interpretación", "verdad", "imparcial", "ecuánime", "adecuado". 

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
        2. La conclusión debe citar, al menos, la afirmación o informaciones más relevantemente incorrectas más relevante de las que aparecen en la noticia y la más dañina de todas y no lanzar adjetivos calificativos para mostrar sus errores o aciertos. La fórmula de respuesta sobre la redacción sería: "incorrectas como por ejemplo" 
        3. El outpout o respuesta de salida debe evitar hacer juicios morales sobre el trabajo del periodista o redactor. Se señala el error, cómo hacerlo adecuadamente o se sugieren mejoras. Y para ello, la conclusión debe argumentarse sobre hechos y datos y dar ejemplos respecto de lo que critica. 
        4. La noticia es desinformativa porque ofrece datos y/o declaraciones falsas, contiene interpretaciones explícitas sin fundamento en la realidad, datos insuficientes, irrelevantes y descontextualizadores que deforman la realidad y desinforman al público. 
        Para responder, evitar utilizar expresiones cómo: 
        La veracidad o imparcialidad, nunca neutralidad porque la verdad no es neutral. 
        Evitar hablar de lenguaje neutral. Solo se habla de lenguaje imparcial, ecuánime o adecuado. 
        Evitar expresiones como "noticias objetivas". Mejor utilizar relatos veraces y noticias verdaderas.  
        Usar expresiones como "fundadas en hechos o datos que "factual" 
        No puedes mencionar en tu análisis a Claude ni a ti mismo como autor del análisis.
        Evita el uso de expresiones como: "hechos verficables". Eso es una redundancia. Utilizar solo la expresión o palabra "Hechos" o "datos" es suficiente. 
        ¡MUY IMPORTANTE! Evita las expresiones "hecho objetivo", "dato objetivo" "interpretación subjetiva", "verdad objetiva", "neutral". Utilizar, en cambio solo "hecho", "dato", "interpretación", "verdad", "imparcial", "ecuánime", "adecuado". 

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
                    Justifica si es adecuada para aprobarla o si necesita mejoras. No menciones a ChatGPT ni a ti mismo como autores del análisis.
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

                No menciones a Claude ni a ti mismo como autores del análisis.
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

        Asigna una puntuación numérica entre 0 y 10, añade máximo dos decimales en caso de que lo veas necesario, a la calidad informativa de la noticia, donde 0 es la más baja y 10 la más alta.
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
        "La noticia presenta interpretaciones subjetivas... objetiva. | ["Fragmento 1"], ["Fragmento 2"]"

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
            "instruccion": """
        Analiza el titular de acuerdo con la siguiente rúbrica oficial de evaluación periodística. 
        Utiliza estrictamente estos criterios, sin añadir otros y sin modificar su significado.

        1. CONCEPTO Y FUNCIÓN DEL TITULAR
        El titular debe:
        - Relatar la información más importante del acontecimiento.
        - Señalar los aspectos fundamentales para comprender sustancialmente el hecho.
        - Si el sujeto es una persona o grupo → responder a “Quién hace qué” o “Quién dice qué”.
        - Si el sujeto es un fenómeno o institución → responder a “Qué hace qué” o “Qué ocasiona qué”.
        - Reflejar implícitamente:
            - el bien o el mal principal generado por el acontecimiento,
            - el impacto humano, emocional o social de sus consecuencias.
        - Reflejar correctamente la trascendencia del hecho (mayor bien o mal causado al mayor número de personas).

        2. ENFOQUE Y CONTENIDO
        El titular debe:
        - Identificar implícitamente el bien o mal provocado por la acción principal.
        - Mostrar cómo y hasta dónde impacta el acontecimiento en las personas.
        - Reflejar el valor informativo real del hecho.
        - Permitir comprender el sentido del acontecimiento para la vida de las personas.

        3. ESTRUCTURA
        El titular debe:
        - Tener sujeto + verbo + predicado.
        - Presentar claramente el sujeto principal y la acción principal.
        - No omitir el sujeto salvo excepciones justificadas cuando sea sobrentendido 
        (ej.: “Detenido el ladrón de Madrid”).
        - Mantener un orden sintáctico claro.
        - No comenzar con un verbo, salvo en las excepciones anteriores.

        4. ESTILO
        El titular debe:
        - Ser breve (ideal entre 7 y 15 palabras).
        - Ser claro, preciso y sin ambigüedades.
        - Utilizar lenguaje coloquial culto, accesible para un público generalista.
        - Evitar vulgarismos, tecnicismos innecesarios o erudición excesiva.
        - Usar correctamente las mayúsculas:
            - nombres propios → mayúscula,
            - nombres comunes → minúscula.

        5. ERRORES COMUNES A PENALIZAR
        Penaliza el titular si incurre en cualquiera de los siguientes errores:
        1. Comenzar con verbos sin justificación.
        2. Desorden sintáctico.
        3. Ausencia de sujeto, verbo u objeto.
        4. Uso de adjetivos calificativos innecesarios.
        5. Verbos imprecisos.
        6. Ambigüedad informativa.
        7. Falta de autonomía de significado (el titular no se entiende por sí solo).
        8. Uso de primera persona.
        9. Sustantivo sin artículo.
        10. Interpretaciones explícitas del periodista.
        11. Opiniones explícitas.
        12. Ausencia de datos relevantes necesarios para comprender el hecho.
        13. Cualquier forma de sensacionalismo o clickbait.

        6. FORMATO DE LA EVALUACIÓN
        Debes desglosar tu análisis en los siguientes apartados:

        1. Concepto y función del elemento
        2. Enfoque y contenido
        3. Estructura
        4. Estilo
        5. Errores comunes detectados

        Después, añade una CONCLUSIÓN GENERAL indicando si el titular es adecuado o no.

        7. DECISIÓN FINAL
        - Si el titular es adecuado, escribe explícitamente: Aprobada
        - Si es inadecuado, explica claramente por qué e incluye un titular alternativo libre de clickbait usando EXACTAMENTE este formato:

        TITULO PROPUESTO: <tu versión alternativa aquí>
        """
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
                    tr = match.group(1)
                    if isinstance(tr, list):
                        tr = " ".join(str(x) for x in tr)
                    elif not isinstance(tr, str):
                        tr = str(tr)
                    titular_reformulado = tr.strip()

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
    
    @staticmethod
    def obtener_resumen_valoracion(openai_client, valoracion_general):
        criterios = [
            "Interpretación del periodista",
            "Opiniones",
            "Cita de fuentes",
            "Confiabilidad de las fuentes",
            "Trascendencia",
            "Relevancia de los datos",
            "Precisión y claridad",
            "Enfoque",
            "Contexto",
            "Ética"
        ]
        prompt = (
            "Genera un resumen del siguiente campo valoracion_general de menos de veinte palabras en el que se recoja de manera profesional, aséptica y sin emoticonos los puntos más importantes de los diez criterios de evaluación: "
            + ", ".join(criterios) + ". "
            "No tiene que ser un resumen de la noticia ni de su contenido, sino de la calidad periodística de la misma. "
            "Campo valoracion_general: " + str(valoracion_general)
        )
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Eres un analista experto en calidad periodística."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=60,
            temperature=0.3
        )
        return response.choices[0].message.content.strip()
    
    @staticmethod
    def extraer_texto_llano(obj):
        """
        Extrae texto plano de posibles formatos de respuesta de Anthropic (string, dict, lista, TextBlock, etc).
        """
        if obj is None:
            return ""
        if isinstance(obj, list):
            # Procesar cada elemento y concatenar los textos extraídos
            textos = [Utils.extraer_texto_llano(x) for x in obj]
            resultado = " ".join(textos).strip()
            # Si tras unir sigue quedando TextBlock(...), limpiar de nuevo
            match = re.search(r"text=([\"'])(.*?)\1", resultado, re.DOTALL)
            if match:
                texto = match.group(2).strip()
                texto = re.sub(r'^Resumen de valoración del titular:\s*', '', texto, flags=re.IGNORECASE)
                return texto
            resultado = re.sub(r'^Resumen de valoración del titular:\s*', '', resultado, flags=re.IGNORECASE)
            return resultado
        if isinstance(obj, str):
            # Si es un string tipo TextBlock(..., text='...', ...)
            match = re.search(r"text=([\"'])(.*?)\1", obj, re.DOTALL)
            if match:
                texto = match.group(2).strip()
                texto = re.sub(r'^Resumen de valoración del titular:\s*', '', texto, flags=re.IGNORECASE)
                return texto
            # Si es string plano
            texto = obj.strip()
            texto = re.sub(r'^Resumen de valoración del titular:\s*', '', texto, flags=re.IGNORECASE)
            return texto
        if isinstance(obj, dict):
            if "text" in obj:
                texto = str(obj["text"]).strip()
                texto = re.sub(r'^Resumen de valoración del titular:\s*', '', texto, flags=re.IGNORECASE)
                return texto
            # Si es dict con un solo valor
            if len(obj) == 1:
                texto = str(list(obj.values())[0]).strip()
                texto = re.sub(r'^Resumen de valoración del titular:\s*', '', texto, flags=re.IGNORECASE)
                return texto
            return str(obj)
        # Si es otro tipo, convertir a string
        texto = str(obj).strip()
        texto = re.sub(r'^Resumen de valoración del titular:\s*', '', texto, flags=re.IGNORECASE)
        return texto

    @staticmethod
    def obtener_resumen_valoracion_titular(anthropic_client, valoracion_titular):
        criterios_titular = [
            "Veracidad",
            "Claridad",
            "Relevancia",
            "Grado de clickbait"
        ]
        # Convertir el diccionario valoracion_titular a un string legible
        if isinstance(valoracion_titular, dict):
            valoracion_titular_str = "\n".join(f"{k}: {v}" for k, v in valoracion_titular.items() if k != "historial")
        else:
            valoracion_titular_str = str(valoracion_titular)
        prompt = (
            "Genera un resumen del siguiente campo valoracion_titular de menos de veinte palabras en el que se recoja de manera profesional, aséptica y sin emoticonos los puntos más importantes de los criterios de evaluación del titular: "
            + ", ".join(criterios_titular) + ". "
            "No tiene que ser un resumen del titular ni de su contenido, sino de la calidad periodística del mismo. "
            "Campo valoracion_titular: " + valoracion_titular_str + "\n"
            "\nIMPORTANTE: Devuelve únicamente el resumen solicitado, sin ningún tipo de explicación, cita, formato, prefijo, ni información adicional. Solo el texto del resumen, en una sola frase."
        )
        response = anthropic_client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=60,
            messages=[{"role": "user", "content": prompt}]
        )
        # Accede solo al texto puro de la respuesta de Anthropic
        if response.content and hasattr(response.content[0], 'text'):
            texto_puro = response.content[0].text
        elif response.content:
            texto_puro = str(response.content[0])
        else:
            texto_puro = ""
        return texto_puro
    
    @staticmethod
    def analizar_noticia_deepseek(model, tokenizer, titulo, noticia):
        import re
        import torch
        
        valoraciones_deepseek = {}
        puntuacion_individual_deepseek = {}
        puntuaciones = []
        device = next(model.parameters()).device

        for key, criterio in Utils.criterios.items():
            nombre_criterio = criterio["nombre"]
            instruccion_criterio = criterio["instruccion"]
            prompt = f"""
Para esta noticia:

{noticia}

Clasifícala cualitativamente (Óptima, Positiva, Regular, Negativa, Desinformativa) en base a la siguiente instrucción y justifica tu decisión escribiendo en qué partes del texto te basas para tomar estas conclusiones. Si no se señalan las partes del texto en que se basan las conclusiones la respuesta no es válida. Menciona las áreas a mejorar y justifica detalladamente tu respuesta:

{instruccion_criterio}

Se requiere que la respuesta que se proporcione sea sin valoraciones interpretativas, sin instrucciones de cómo debe de ser una noticia. Siempre que se emita un juicio este no será moral en ningún caso e irá acompañado de una justificación. Se centrará solamente en el carácter informativo de la noticia. Las palabras seleccionadas se harán rigurosa y meticulosamente para evitar el mal uso del lenguaje como pueda ser la redundancia o el empleo de un término inapropiado como pueda ser la palabra "neutralidad" para referirse a la verdad, ya que la verdad no puede ser neutra, en todo caso sería imparcial. La conclusión debería citar, al menos, la afirmación incorrecta más relevante de las que aparecen en la noticia y la más dañina de todas y no solo lanzar adjetivos descalificativos. La redacción sería: “incorrectas como..." y "dañiñas como por ejemplo...".

Ejemplos de salida pueden ser:

1º La noticia es sobresaliente porque ofrece un relato ordenado y veraz en el que las afirmaciones del periodista están sustentadas en datos y/o declaraciones relevantes y suficientes para la comprensión del acontecimiento.

2º La noticia es aceptable porque ofrece datos y declaraciones ciertas pero insuficientes para una contextualización y comprensión adecuada del acontecimiento.

3º La noticia es deficiente porque ofrece interpretaciones explícitas y afirmaciones sesgadas del periodista sin fundamento en los datos de la realidad, ofrece datos y declaraciones irrelevantes que descontextualizan la relevancia y comprensión del acontecimiento.

4º La noticia es desinformativa porque ofrece datos y/o declaraciones falsas, contiene interpretaciones explícitas sin fundamento en la realidad, datos insuficientes, irrelevantes y descontextualizadores que deforman la realidad y desinforman al público.
"""
            inputs = tokenizer(prompt, return_tensors="pt").to(device)
            outputs = model.generate(**inputs, max_new_tokens=300)
            respuesta = tokenizer.decode(outputs[0], skip_special_tokens=True)
            valoraciones_deepseek[nombre_criterio] = respuesta

            # Segunda llamada: obtener puntuación individual
            prompt_puntuacion = f"""
Considera la siguiente noticia:
Título: {titulo}
Noticia: {noticia}

Y la valoración final:
{respuesta}

Asigna una puntuación numérica entre 1 y 100 a la calidad informativa de la noticia según este criterio, donde 1 es la más baja y 100 la más alta.
Responde únicamente con el número.
"""
            inputs_punt = tokenizer(prompt_puntuacion, return_tensors="pt").to(device)
            outputs_punt = model.generate(**inputs_punt, max_new_tokens=10)
            respuesta_punt = tokenizer.decode(outputs_punt[0], skip_special_tokens=True)
            match = re.search(r"\b(\d{1,3})\b", respuesta_punt)
            if match and 1 <= int(match.group(1)) <= 100:
                punt = int(match.group(1))
            else:
                punt = None
            puntuacion_individual_deepseek[nombre_criterio] = punt
            if punt is not None:
                puntuaciones.append(punt)
        puntuacion_global_deepseek = int(sum(puntuaciones) / len(puntuaciones)) if puntuaciones else None
        return {
            "valoraciones": valoraciones_deepseek,
            "puntuacion_individual": puntuacion_individual_deepseek,
            "puntuacion_global": puntuacion_global_deepseek
        }

    @staticmethod
    def normalizar_embedding(embedding):
        arr = np.array(embedding, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm == 0:
            return arr
        return arr / norm

    @staticmethod
    def similitud_coseno(embedding1, embedding2):
        v1 = Utils.normalizar_embedding(embedding1)
        v2 = Utils.normalizar_embedding(embedding2)
        return float(np.dot(v1, v2))

    @staticmethod
    def pipeline_fake_news_por_id(
        noticia_id,
        openai_client,
        read_mongo_uri,
        write_mongo_uri,
        db_name='Base_de_datos_noticias',
        collection_name='Noticias',
        similitud_umbral=0.92,
        max_similares=3,
        fake_news_por_noticia=3,
        dias_ventana=7
    ):
        import time
        from bson import ObjectId
        from pymongo import MongoClient
        from datetime import datetime, timedelta
        read_client = MongoClient(read_mongo_uri)
        read_col = read_client[db_name][collection_name]
        noticia = read_col.find_one({'_id': ObjectId(noticia_id)})
        if not noticia or 'embedding' not in noticia:
            print('Noticia no encontrada o sin embedding.')
            return
        emb_original = Utils.normalizar_embedding(noticia['embedding'])
        fecha_ref = noticia.get('fecha_publicacion')
        if not fecha_ref:
            print('Noticia sin campo fecha_publicacion, se omite filtro temporal.')
        else:
            try:
                fecha_ref_dt = datetime.fromisoformat(str(fecha_ref))
            except Exception:
                print('Campo fecha_publicacion no es válido, se omite filtro temporal.')
                fecha_ref_dt = None
        # 1. Buscar las noticias más similares (incluyendo la propia)
        grupo = []
        for doc in read_col.find({'embedding': {'$exists': True}}):
            # Filtro temporal
            if fecha_ref and 'fecha_publicacion' in doc:
                try:
                    fecha_doc = datetime.fromisoformat(str(doc['fecha_publicacion']))
                    if fecha_ref_dt and abs((fecha_doc - fecha_ref_dt).days) > dias_ventana:
                        continue
                except Exception:
                    continue
            emb = Utils.normalizar_embedding(doc['embedding'])
            sim = Utils.similitud_coseno(emb_original, emb)
            if sim >= similitud_umbral:
                grupo.append(doc)
        grupo = sorted(grupo, key=lambda d: d['_id'])[:max_similares]
        if not grupo:
            print('No se encontraron noticias suficientemente similares para agrupar.')
            return
        print(f"\nAgrupación de noticias originales (IDs): {[str(doc['_id']) for doc in grupo]}")
        # 2. Generar fake news para cada noticia del grupo
        fake_news_docs = []
        fake_news_texts = []
        fake_news_meta = []  # Para asociar cada texto a su noticia original y título
        write_client = MongoClient(write_mongo_uri)
        write_col = write_client[db_name][collection_name]
        for doc in grupo:
            cuerpo = doc.get('cuerpo', '')
            titulo = doc.get('titulo', '')
            for i in range(fake_news_por_noticia):
                prompt = (
                    f"A partir de la siguiente noticia, genera una fake news plausible de tamaño similar. "
                    f"Manipula la información siguiendo estas instrucciones:\n"
                    f"- Cambia cifras clave.\n- Atribuye declaraciones a otras fuentes.\n- Introduce teorías conspirativas creíbles.\n- Exagera consecuencias.\n"
                    f"No hagas la noticia absurda, debe ser creíble.\n\n"
                    f"TÍTULO: {titulo}\nCUERPO: {cuerpo}\n\n"
                    f"Devuelve solo el texto de la noticia falsa, sin explicaciones ni formato especial."
                )
                try:
                    response = openai_client.chat.completions.create(
                        model="gpt-4o",
                        messages=[
                            {"role": "system", "content": "Eres un generador de fake news plausibles para experimentos de IA."},
                            {"role": "user", "content": prompt}
                        ],
                        temperature=0.9,
                        max_tokens=1024
                    )
                    fake_text = response.choices[0].message.content.strip()
                    fake_news_texts.append(fake_text)
                    fake_news_meta.append({
                        'titulo': titulo,
                        'id_original': doc['_id'],
                        'timestamp': time.time()
                    })
                except Exception as e:
                    print(f"[ERROR] Generando fake news para noticia {doc['_id']}: {e}")
        # Llamada batch a la API de embeddings
        fake_news_embeddings = []
        if fake_news_texts:
            try:
                emb_resp = openai_client.embeddings.create(
                    input=fake_news_texts,
                    model="text-embedding-3-small"
                )
                fake_news_embeddings = [item.embedding for item in emb_resp.data]
            except Exception as e:
                print(f"[CRITICAL] Error en batch de embeddings para fake news del grupo: {e}")
                fake_news_embeddings = [None] * len(fake_news_texts)
        # Asociar embeddings y guardar fake news
        for i, meta in enumerate(fake_news_meta):
            fake_emb = fake_news_embeddings[i] if i < len(fake_news_embeddings) else None
            if fake_emb is None:
                print(f"[WARNING] No se pudo generar embedding batch para una fake news de la noticia {meta['id_original']} (fake #{i+1})")
            fake_doc = {
                'titulo': f"FAKE: {meta['titulo']}",
                'cuerpo': fake_news_texts[i],
                'embedding': fake_emb,
                'id_original': meta['id_original'],
                'tipo': 'fake_news',
                'timestamp': meta['timestamp']
            }
            write_col.insert_one(fake_doc)
            fake_news_docs.append(fake_doc)
        # Si todas las fake news de una noticia original fallan en embedding, marcar la noticia
        for doc in grupo:
            count_total = sum(1 for meta in fake_news_meta if meta['id_original'] == doc['_id'])
            count_failed = sum(1 for idx, meta in enumerate(fake_news_meta) if meta['id_original'] == doc['_id'] and (fake_news_embeddings[idx] is None))
            if count_total > 0 and count_failed == count_total:
                print(f"[CRITICAL] Todas las fake news de la noticia {doc['_id']} fallaron en embedding batch. Marcando para revisión manual.")
                write_col.update_one({'_id': doc['_id']}, {'$set': {'embedding_fake_news_failed': True}}, upsert=True)

# Helper para mostrar ObjectId como string

def _id_str(doc):
    return str(doc['_id']) if '_id' in doc else str(doc.get('id_original','?'))

    @staticmethod
    def copy_basic_fields_to_new_db(doc, old_collection, new_collection):
        # Lista de campos básicos a copiar
        basic_fields = [
            'titulo', 'cuerpo', 'url', 'autor', 'fecha_publicacion', 'fuente',
            'fecha_extraccion', 'tags', 'keywords', 'top_image', 'images', 'is_media_news'
        ]
        # Buscar el documento en la base nueva
        existing = new_collection.find_one({'_id': doc['_id']})
        update_fields = {}
        for field in basic_fields:
            value = doc.get(field)
            if value is not None and value != '':
                # Si el campo no existe o está vacío en la nueva, lo copiamos
                if not existing or field not in existing or existing[field] in (None, '', []):
                    update_fields[field] = value
        if update_fields:
            new_collection.update_one({'_id': doc['_id']}, {'$set': update_fields}, upsert=True)



