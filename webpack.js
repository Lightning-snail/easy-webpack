// 利用node写一个webpack打包工具

// 实现什么功能?
  // 将src中的几个js文件打包成一个js文件,配合html使用,输出到dist目录下

// 文件加载
  // 从什么地方加载? 配置入口文件,目前测试阶段,先写死为'./src/index.js' 需要一个文件加载方法 getModuleInfo(file) - file - 文件路径

  // 需要知道index.js中的依赖关系 需要一个分析文件依赖方法 parseFile(filecontent) - filecontent - 文件内容

  // 1.通过getModuleInfo加载入口文件
  // 2.通过parseFile分析文件依赖
  // 3.通过getModuleInfo加载依赖文件...

  const fs = require('fs'); // 引入文件系统模块
  const path = require('path');
  
  const getModuleInfo = function(file){
    const body = fs.readFileSync(file, 'utf-8'); // 读取文件内容 使用同步方法,后端服务不需要使用异步方法 这里已经拿到了文件内容,接下来需要分析文件的依赖关系,可以使用遍历字符串的方式,但是效率不高,

    const parser = require('@babel/parser');    // https://babel.nodejs.cn/docs/babel-parser/#google_vignette babel/parser的官网文档

    const ast = parser.parse(body, {            // babel/parser是一个解析代码,返回ast语法树的工具
      sourceType: "module"
    });

    const traverse = require('@babel/traverse').default;

    const deps = {}                               // 收集依赖关系的对象

    traverse(ast, {                               // npm install @babel/traverse @babel/traverse 是一款用来自动遍历抽象语法树的工具，它会访问树中的所有节点，
      ImportDeclaration({node}){                  // 在进入每个节点时触发 enter 钩子函数，退出每个节点时触发 exit 钩子函数。 开发者可在钩子函数中对 AST 进行修改。
        const name = node.source.value;
        const dirname = path.dirname(file);
        const filepath = path.join(dirname, name);
        deps[name] = filepath;
      }
    });

    // console.log('deps', deps);                    // 打印结果:deps { './add.js': 'src/add.js', './minus.js': 'src/minus.js' }
    const babel = require('@babel/core')
    const {code} = babel.transformFromAst(ast, null, {  // 将ast转换成es5可执行代码
      presets: ['@babel/preset-env']
    })

    return {
      file,
      deps,
      code
    };
  }


  const parseModules = (file) => {      // 循环递归所有有依赖关系的文件,继续循环递归依赖文件,将代码解析成ES5可执行代码
    const entry = getModuleInfo(file);  // 获取入口文件信息 和 依赖信息
    const temp = [entry];
    for(let i = 0; i < temp.length; i++){
      const item = temp[i];
      const deps= temp[i].deps;
      if(deps){
        for (const key in deps) {
          if(deps.hasOwnProperty(key)){
            temp.push(getModuleInfo(deps[key]));
          }
        }
      }
    }
    const depsGraph = {};
    for(let i = 0; i < temp.length; i++){ // 将数组转为对象,方便访问
      const item = temp[i];
      depsGraph[item.file] = {
        deps: item.deps,
        code: item.code
      }
    }
    return depsGraph;
  }

  // bundle方法解析:
  // bundle方法将处理好依赖路径和转换成ES5代码的对象转成JSON字符串. 为什么要这么干呢? : 因为浏览器不能直接执行JS代码, 所以需要转成字符串, 再通过eval执行.
  // 转成es5代码里使用了require和exports, 所以需要提前定义这两个方法. 自己定义的require就是一个function方法,传入路径值就是depsGraph整理好的依赖对象的key(巧妙)
  // export将每个模块导出
  // 最后将打包后的可执行的代码写入到bundle.js中; html引入bundle.js即可运行
  const bundle = (file) => {
    const depsGraph = JSON.stringify(parseModules(file));

    return `
      (function(graph){

        function require(file){

          function absRequire(relPath){
            return require(graph[file].deps[relPath])
          }

          var exports = {};

          (function(require, exports, code){

            eval(code)

          })(absRequire, exports, graph[file].code)

          return exports
          
        }

        require('${file}')

      })(${depsGraph})
      `
  }

  const content = bundle('./src/index.js')

  fs.mkdirSync('./dist') // 创建文件夹
  fs.writeFileSync('./dist/bundle.js', content);

                                    