import React from 'react';

const SkeletonAnalysis = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 items-start animate-pulse">
      {/* Columna Izquierda: Contenido del análisis */}
      <div className="space-y-6">
        {/* Información básica */}
        <div className="p-6 bg-white/95 shadow-xl rounded-xl border-l-4 border-gray-200">
          <div className="flex flex-col md:flex-row gap-4 md:items-center">
            {/* Columna izquierda: Título y Metadatos */}
            <div className="flex-1 space-y-4">
              {/* Título */}
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              
              {/* Metadatos grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                </div>
                <div className="col-span-1 sm:col-span-2 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            </div>

            {/* Columna derecha: Puntuación placeholder */}
            <div className="flex flex-col items-end gap-3 flex-shrink-0 md:w-48 lg:w-56">
              <div className="flex flex-col items-center justify-center space-y-2">
                 <div className="h-12 w-12 bg-gray-200 rounded-full"></div>
                 <div className="h-8 w-16 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Análisis adicional - Grid de botones */}
        <div className="bg-white/95 shadow-xl rounded-xl p-6">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>

        {/* Valoraciones por sección */}
        <div className="bg-white/95 shadow-xl rounded-xl p-6">
           <div className="h-6 bg-gray-200 rounded w-56 mb-4"></div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
            ))}
           </div>
        </div>
      </div>

      {/* Columna Derecha: Chatbot Placeholder */}
      <div className="hidden lg:block sticky top-4">
         <div className="bg-white/95 shadow-xl rounded-xl p-6 h-[600px] flex flex-col gap-4">
            <div className="h-8 bg-gray-200 rounded w-1/3 mx-auto"></div>
            <div className="flex-1 bg-gray-100 rounded-lg"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
         </div>
      </div>
    </div>
  );
};

export default SkeletonAnalysis;
