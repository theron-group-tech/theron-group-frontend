from flask import Flask, render_template, redirect, url_for

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/theron-capital')
def theron_capital():
    return render_template('capital.html')

@app.route('/theronseg')
def theronseg():
    return render_template('seg.html')

@app.route('/theron-tour')
def theron_tour():
    return render_template('tour.html')

@app.route('/theron-consultoria')
def theron_consultoria():
    return render_template('consultoria.html')

@app.errorhandler(404)
def page_not_found(e):
    return redirect(url_for('index'))

if __name__ == "__main__":
    app.run()